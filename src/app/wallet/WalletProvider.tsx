import { useChain } from "@cosmos-kit/react"
import type { ChainWalletBase } from "@cosmos-kit/core"
import type { OfflineSigner } from "@cosmjs/proto-signing"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { CLASSIC_CHAIN } from "../chain"
import { classifyTxError, recordTxDiagnostic } from "../tx/txDiagnostics"
import {
  COSMOS_CONNECTOR_CONFIGS,
  COSMOS_KIT_CHAIN_NAME,
  COSMOS_WALLET_NAME_TO_CONNECTOR_ID,
  isCosmosConnectorId
} from "./cosmosKit"
import { getGalaxyConnector } from "./galaxyWallet"
import {
  WalletContext,
  type WalletAccount,
  type TxState,
  type WalletConnector,
  type WalletConnectorId,
  type WalletContextValue,
  type WalletStatus
} from "./WalletContext"
import {
  type ClassicStargateClient,
  connectWalletConnector,
  disconnectWalletConnector,
  registerWalletAdapterRuntime
} from "./walletAdapters"
import { isTouchWalletCapableBrowser } from "./walletPlatform"
import {
  WALLET_CONNECTOR_STORAGE_KEY,
  getStoredWalletConnectorId
} from "./walletMeta"
const MOBILE_CONNECT_HANDOFF_TIMEOUT_MS = 90
const MOBILE_ACCOUNT_HYDRATION_DELAYS_MS = [250, 1000, 2500, 5000] as const

const connectMobileWallet = async (wallet: ChainWalletBase) => {
  const attemptConnect = async (resetPairings: boolean) => {
    if (resetPairings) {
      try {
        await wallet.disconnect(false, {
          walletconnect: {
            removeAllPairings: true
          }
        })
      } catch {
        // Best-effort cleanup for stale WalletConnect sessions.
      }
    }

    const connectPromise = wallet.connect(true)
    const settled = await Promise.race([
      connectPromise.then(() => "resolved" as const),
      new Promise<"pending">((resolve) =>
        window.setTimeout(
          () => resolve("pending"),
          MOBILE_CONNECT_HANDOFF_TIMEOUT_MS
        )
      )
    ])

    if (settled === "pending") {
      void connectPromise.catch(() => {
        // The normal wallet state flow will surface follow-up errors.
      })
      return undefined
    }

    await waitForWalletAddress(wallet, 5, 150)
    return buildWalletAccount(wallet)
  }

  try {
    return await attemptConnect(false)
  } catch {
    return attemptConnect(true)
  }
}

const hasDesktopKeplrProvider = () =>
  typeof window !== "undefined" && Boolean((window as Window & { keplr?: unknown }).keplr)

const formatWalletError = (error: unknown) =>
  error instanceof Error ? error.message : "Wallet connection failed"

const isWalletReady = (wallet?: ChainWalletBase) =>
  Boolean(wallet && !wallet.isWalletNotExist)

const matchesWalletAlias = (wallet: ChainWalletBase, aliases: string[]) => {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase())
  const walletName = wallet.walletName?.toLowerCase?.() ?? ""
  const walletPrettyName = wallet.walletPrettyName?.toLowerCase?.() ?? ""

  return normalizedAliases.some(
    (alias) => walletName === alias || walletPrettyName === alias
  )
}

const buildWalletAccount = (wallet: ChainWalletBase): WalletAccount | undefined => {
  const address = wallet.address
  if (!address) {
    return undefined
  }

  return {
    address,
    name: wallet.username || wallet.walletPrettyName
  }
}

const waitForWalletAddress = async (wallet: ChainWalletBase, attempts = 10, delayMs = 200) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (wallet.address) {
      return wallet.address
    }
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }
  return wallet.address
}

const getOfflineSignerAddress = async (signer: OfflineSigner) => {
  const account = (await signer.getAccounts())[0]
  if (!account?.address) {
    throw new Error("Wallet account unavailable")
  }
  return account.address
}

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const cosmosChain = useChain(COSMOS_KIT_CHAIN_NAME)
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletAccount>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const currentTxLabelRef = useRef<string | undefined>(undefined)
  const [connectorRefreshNonce, setConnectorRefreshNonce] = useState(0)
  const [pendingAutoConnectId] = useState<WalletConnectorId | undefined>(
    () => getStoredWalletConnectorId()
  )
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(
    () => !pendingAutoConnectId
  )

  const supportsMobileWallets = useMemo(() => isTouchWalletCapableBrowser(), [])
  const currentCosmosWalletName = cosmosChain.walletRepo.current?.walletName
  const currentCosmosWallet = cosmosChain.walletRepo.current
  const desktopKeplrAvailable = hasDesktopKeplrProvider()
  const effectivePendingAutoConnectId =
    pendingAutoConnectId === "keplr-mobile" && desktopKeplrAvailable
      ? "keplr"
      : pendingAutoConnectId
  const activeCosmosConnectorId = currentCosmosWalletName
    ? COSMOS_WALLET_NAME_TO_CONNECTOR_ID[currentCosmosWalletName]
    : undefined

  const refreshConnectors = useCallback(() => {
    setConnectorRefreshNonce((current) => current + 1)
  }, [])

  const getCosmosWallet = useCallback(
    (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      options?: { preferConnected?: boolean }
    ) => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      const wallet =
        cosmosChain.walletRepo.getWallet(config.walletName) ??
        cosmosChain.walletRepo.wallets.find((item) =>
          matchesWalletAlias(item, [config.walletName, config.label])
        )

      if (
        options?.preferConnected &&
        wallet &&
        !wallet.isWalletDisconnected &&
        !wallet.isWalletNotExist
      ) {
        return wallet
      }

      return wallet
    },
    [cosmosChain.walletRepo]
  )

  const getCosmosConnector = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS): WalletConnector => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      if (id === "keplr" && desktopKeplrAvailable) {
        return {
          id,
          label: config.label,
          type: config.type,
          available: true
        }
      }
      const wallet = getCosmosWallet(id)
      const available =
        config.type === "mobile"
          ? Boolean(wallet) && supportsMobileWallets && !desktopKeplrAvailable
          : isWalletReady(wallet)

      return {
        id,
        label: config.label,
        type: config.type,
        available
      }
    },
    [desktopKeplrAvailable, getCosmosWallet, supportsMobileWallets]
  )

  const connectCosmosConnector = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const wallet = getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} not available`)
      }
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"

      if (isMobileWallet) {
        return connectMobileWallet(wallet)
      }

      await wallet.connect(true)
      return buildWalletAccount(wallet)
    },
    [getCosmosWallet]
  )

  const getCosmosOfflineSigner = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const activeWallet = cosmosChain.walletRepo.current
      const shouldUseChainSigner =
        !isMobileWallet &&
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain.isWalletConnected

      if (shouldUseChainSigner) {
        if (!cosmosChain.address) {
          await waitForWalletAddress(activeWallet!, 8, 150)
        }

        try {
          return cosmosChain.getOfflineSigner()
        } catch {
          // Fall back to the underlying wallet instance when Cosmos Kit has not
          // fully hydrated its signer yet.
        }
      }

      if (wallet.isWalletDisconnected) {
        await wallet.connect(false)
      }
      if (!wallet.address) {
        await wallet.update({ connect: false })
        await waitForWalletAddress(wallet)
      }
      if (!wallet.address) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} account unavailable`)
      }
      if (!wallet.offlineSigner) {
        await wallet.initOfflineSigner()
      }
      if (!wallet.offlineSigner) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }
      return wallet.offlineSigner
    },
    [cosmosChain, getCosmosWallet]
  )

  const getCosmosAminoOfflineSigner = useCallback(
    async (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS
    ): Promise<OfflineSigner | undefined> => {
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const activeWallet = currentCosmosWallet
      const shouldUseChainWallet =
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain.isWalletConnected

      if (shouldUseChainWallet && !cosmosChain.address) {
        await waitForWalletAddress(activeWallet!, 8, 150)
      }

      if (wallet.isWalletDisconnected) {
        await wallet.connect(false)
      }
      if (!wallet.address) {
        await wallet.update({ connect: false })
        await waitForWalletAddress(wallet)
      }
      if (!wallet.address) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} account unavailable`)
      }

      const aminoSigner = wallet.client?.getOfflineSignerAmino?.(
        CLASSIC_CHAIN.chainId
      )
      if (aminoSigner) {
        return aminoSigner
      }

      try {
        await wallet.initOfflineSigner("amino")
        if (wallet.offlineSigner) {
          return wallet.offlineSigner
        }
      } catch {
        // Some wallets only expose direct signing; fall back to the default path.
      }

      return undefined
    },
    [cosmosChain.address, cosmosChain.isWalletConnected, currentCosmosWallet, getCosmosWallet]
  )

  const getCosmosSigningStargateClient = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const wrapStargateClient = (
        client: ClassicStargateClient,
        signerAddress: string,
        signAndBroadcastImpl?: (
          messages: Parameters<ClassicStargateClient["signAndBroadcast"]>[1],
          fee: Parameters<ClassicStargateClient["signAndBroadcast"]>[2],
          memo?: string
        ) => ReturnType<ClassicStargateClient["signAndBroadcast"]>
      ): ClassicStargateClient => ({
        ...client,
        simulate: (
          _signerAddress: string,
          messages: Parameters<ClassicStargateClient["simulate"]>[1],
          memo: string
        ) => client.simulate(signerAddress, messages, memo),
        sign: (
          _signerAddress: string,
          messages: Parameters<ClassicStargateClient["sign"]>[1],
          fee: Parameters<ClassicStargateClient["sign"]>[2],
          memo: string,
          signerData: Parameters<ClassicStargateClient["sign"]>[4]
        ) => client.sign(signerAddress, messages, fee, memo, signerData),
        signAndBroadcast: (
          _signerAddress: string,
          messages: Parameters<ClassicStargateClient["signAndBroadcast"]>[1],
          fee: Parameters<ClassicStargateClient["signAndBroadcast"]>[2],
          memo = ""
        ) =>
          signAndBroadcastImpl
            ? signAndBroadcastImpl(messages, fee, memo)
            : client.signAndBroadcast(signerAddress, messages, fee, memo),
        getSequence: (address: string) => client.getSequence(address),
        broadcastTxSync: (tx: Parameters<ClassicStargateClient["broadcastTxSync"]>[0]) =>
          client.broadcastTxSync(tx),
        delegateTokens: (
          _delegatorAddress: string,
          validatorAddress: Parameters<ClassicStargateClient["delegateTokens"]>[1],
          amount: Parameters<ClassicStargateClient["delegateTokens"]>[2],
          fee: Parameters<ClassicStargateClient["delegateTokens"]>[3],
          memo?: Parameters<ClassicStargateClient["delegateTokens"]>[4]
        ) => client.delegateTokens(signerAddress, validatorAddress, amount, fee, memo),
        undelegateTokens: (
          _delegatorAddress: string,
          validatorAddress: Parameters<ClassicStargateClient["undelegateTokens"]>[1],
          amount: Parameters<ClassicStargateClient["undelegateTokens"]>[2],
          fee: Parameters<ClassicStargateClient["undelegateTokens"]>[3],
          memo?: Parameters<ClassicStargateClient["undelegateTokens"]>[4]
        ) => client.undelegateTokens(signerAddress, validatorAddress, amount, fee, memo)
      })

      const activeWallet = currentCosmosWallet
      const shouldUseChainClient =
        !isMobileWallet &&
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain.isWalletConnected

      if (shouldUseChainClient) {
        if (!cosmosChain.address) {
          await waitForWalletAddress(activeWallet!, 8, 150)
        }

        try {
          const signerAddress = await getOfflineSignerAddress(
            await getCosmosOfflineSigner(id)
          )
          const client = await cosmosChain.getSigningStargateClient()
          return wrapStargateClient(client, signerAddress, (messages, fee, memo = "") =>
            cosmosChain.signAndBroadcast([...messages], fee as never, memo, "stargate")
          )
        } catch {
          // Fall back to the wallet instance when the chain hook client is not hydrated yet.
        }
      }

      if (wallet.isWalletDisconnected) {
        await wallet.connect(false)
      }
      if (!wallet.address) {
        await wallet.update({ connect: false })
        await waitForWalletAddress(wallet)
      }
      if (!wallet.address) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} account unavailable`)
      }

      try {
        const signerAddress =
          wallet.address ||
          (await getOfflineSignerAddress(await getCosmosOfflineSigner(id)))
        const client = await wallet.getSigningStargateClient()
        return wrapStargateClient(client, signerAddress, (messages, fee, memo = "") =>
          wallet.signAndBroadcast([...messages], fee as never, memo, "stargate")
        )
      } catch {
        return undefined
      }
    },
    [cosmosChain, currentCosmosWallet, getCosmosOfflineSigner, getCosmosWallet]
  )

  const connectors = useMemo(
    () => {
      void connectorRefreshNonce
      return [
        getCosmosConnector("keplr"),
        getCosmosConnector("keplr-mobile"),
        getGalaxyConnector()
      ]
    },
    [connectorRefreshNonce, getCosmosConnector]
  )

  const connect = useCallback(
    async (id: WalletConnectorId) => {
      setStatus("connecting")
      setAccount(undefined)
      setError(undefined)
      try {
        const nextAccount =
          id === "keplr" && desktopKeplrAvailable
            ? await connectWalletConnector(id)
            : isCosmosConnectorId(id)
              ? await connectCosmosConnector(id)
              : await connectWalletConnector(id)
        setConnectorId(id)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(WALLET_CONNECTOR_STORAGE_KEY, id)
        }
        if (nextAccount) {
          setAccount(nextAccount)
          setStatus("connected")
        } else {
          // Mobile wallets often hand control to the native app first and only
          // hydrate the address after the page regains focus. Don't keep the UI
          // stuck in "connecting" while we wait for Cosmos Kit to reconcile.
          setStatus("disconnected")
        }
      } catch (err) {
        setStatus("error")
        setError(formatWalletError(err))
      }
    },
    [connectCosmosConnector, desktopKeplrAvailable]
  )

  const disconnect = useCallback(async () => {
    if (
      connectorId &&
      !(connectorId === "keplr" && desktopKeplrAvailable) &&
      isCosmosConnectorId(connectorId) &&
      cosmosChain.walletRepo.current
    ) {
      await cosmosChain.walletRepo.disconnect(undefined, true)
    } else if (connectorId) {
      await disconnectWalletConnector(connectorId)
    }
    setAccount(undefined)
    setConnectorId(undefined)
    setError(undefined)
    setStatus("disconnected")
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WALLET_CONNECTOR_STORAGE_KEY)
    }
  }, [connectorId, cosmosChain.walletRepo, desktopKeplrAvailable])

  const startTx = useCallback((label?: string) => {
    currentTxLabelRef.current = label
    recordTxDiagnostic({
      phase: "start",
      label,
      connectorId,
      accountAddress: account?.address
    })
    setTxState({ status: "pending", label, startedAt: Date.now() })
  }, [account?.address, connectorId])

  const finishTx = useCallback((hash?: string) => {
    recordTxDiagnostic({
      phase: "success",
      label: currentTxLabelRef.current,
      connectorId,
      accountAddress: account?.address,
      txHash: hash
    })
    currentTxLabelRef.current = undefined
    setTxState({ status: "success", hash })
  }, [account?.address, connectorId])

  const failTx = useCallback((err?: string) => {
    const classified = classifyTxError(err, "Transaction failed")
    recordTxDiagnostic({
      phase: "failure",
      label: currentTxLabelRef.current,
      connectorId,
      accountAddress: account?.address,
      category: classified.category,
      message: classified.userMessage,
      rawMessage: classified.rawMessage
    })
    currentTxLabelRef.current = undefined
    setTxState({ status: "error", error: err })
  }, [account?.address, connectorId])

  const clearTx = useCallback(() => {
    setTxState({ status: "idle" })
  }, [])

  useEffect(() => {
    if (txState.status === "pending") {
      const timer = window.setTimeout(() => {
        setTxState((current) =>
          current.status === "pending" ? { status: "idle" } : current
        )
      }, 90_000)
      return () => window.clearTimeout(timer)
    }
    if (txState.status === "success" || txState.status === "error") {
      const timer = window.setTimeout(
        () => setTxState({ status: "idle" }),
        6000
      )
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [txState.status])

  useEffect(() => {
    const retryDelays = [250, 900, 1800, 3200]
    const timers = [0, ...retryDelays].map((delay) =>
      window.setTimeout(refreshConnectors, delay)
    )
    const handleFocus = () => {
      refreshConnectors()
    }
    window.addEventListener("focus", handleFocus)
    window.addEventListener("pageshow", handleFocus)
    document.addEventListener("visibilitychange", handleFocus)
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("pageshow", handleFocus)
      document.removeEventListener("visibilitychange", handleFocus)
    }
  }, [refreshConnectors])

  useEffect(() => {
    registerWalletAdapterRuntime({
      getConnector: (id) =>
        isCosmosConnectorId(id) ? getCosmosConnector(id) : undefined,
      connect: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
            ? await connectCosmosConnector(id)
            : undefined,
      getAminoOfflineSigner: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
          ? await getCosmosAminoOfflineSigner(id)
          : undefined,
      getSigningStargateClient: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
          ? await getCosmosSigningStargateClient(id)
          : undefined,
      getOfflineSigner: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
            ? await getCosmosOfflineSigner(id)
            : undefined
    })
    return () => {
      registerWalletAdapterRuntime(undefined)
    }
  }, [
    connectCosmosConnector,
    cosmosChain.isWalletConnected,
    cosmosChain.walletRepo,
    getCosmosAminoOfflineSigner,
    getCosmosConnector,
    getCosmosSigningStargateClient,
    getCosmosOfflineSigner,
    desktopKeplrAvailable
  ])

  useEffect(() => {
    if (!activeCosmosConnectorId || !cosmosChain.isWalletConnected || !cosmosChain.address) {
      return
    }
    if (connectorId === "keplr" && desktopKeplrAvailable) {
      return
    }
    const nextAccount = {
      address: cosmosChain.address,
      name: cosmosChain.username || cosmosChain.wallet?.prettyName
    }
    const timer = window.setTimeout(() => {
      setAccount((current) =>
        current?.address === nextAccount.address && current?.name === nextAccount.name
          ? current
          : nextAccount
      )
      setConnectorId((current) =>
        current === activeCosmosConnectorId ? current : activeCosmosConnectorId
      )
      setStatus("connected")
      setError(undefined)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          WALLET_CONNECTOR_STORAGE_KEY,
          activeCosmosConnectorId
        )
      }
      if (!autoConnectAttempted) {
        setAutoConnectAttempted(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    activeCosmosConnectorId,
    autoConnectAttempted,
    connectorId,
    cosmosChain.address,
    cosmosChain.isWalletConnected,
    cosmosChain.username,
    cosmosChain.wallet?.prettyName,
    desktopKeplrAvailable
  ])

  useEffect(() => {
    if (!connectorId || !isCosmosConnectorId(connectorId)) return
    if (connectorId === "keplr" && desktopKeplrAvailable) return
    if (status !== "connected") return
    if (cosmosChain.isWalletConnected) return
    if (activeCosmosConnectorId) return
    const timer = window.setTimeout(() => {
      setAccount(undefined)
      setStatus("disconnected")
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    activeCosmosConnectorId,
    connectorId,
    cosmosChain.isWalletConnected,
    desktopKeplrAvailable,
    status
  ])

  const pendingAutoConnectAvailable = useMemo(
    () =>
      Boolean(
        effectivePendingAutoConnectId &&
          connectors.some(
            (connector) =>
              connector.id === effectivePendingAutoConnectId &&
              connector.available
          )
      ),
    [connectors, effectivePendingAutoConnectId]
  )

  useEffect(() => {
    if (autoConnectAttempted || !effectivePendingAutoConnectId) return
    if (!pendingAutoConnectAvailable) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void connect(effectivePendingAutoConnectId).finally(() => {
        if (!cancelled) {
          setAutoConnectAttempted(true)
        }
      })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    autoConnectAttempted,
    connect,
    effectivePendingAutoConnectId,
    pendingAutoConnectAvailable,
    supportsMobileWallets
  ])

  useEffect(() => {
    if (!connectorId || !isCosmosConnectorId(connectorId)) return
    if (connectorId === "keplr" && desktopKeplrAvailable) return
    if (account?.address || status === "connected") return

    let cancelled = false
    const wallet = getCosmosWallet(connectorId, { preferConnected: true }) ?? getCosmosWallet(connectorId)
    if (!wallet) return

    const tryHydrate = async () => {
      try {
        if (!wallet.address) {
          await wallet.update({ connect: false })
        }
        await waitForWalletAddress(wallet, 4, 150)
        if (cancelled || !wallet.address) return

        const nextAccount = buildWalletAccount(wallet)
        if (!nextAccount) return
        setAccount(nextAccount)
        setStatus("connected")
        setError(undefined)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(WALLET_CONNECTOR_STORAGE_KEY, connectorId)
        }
      } catch {
        // Mobile WalletConnect sessions can hydrate after focus returns; keep
        // the explicit connect button available if silent hydration fails.
      }
    }

    const timers = MOBILE_ACCOUNT_HYDRATION_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        void tryHydrate()
      }, delay)
    )

    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    account?.address,
    connectorId,
    desktopKeplrAvailable,
    getCosmosWallet,
    status
  ])

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      connectorId,
      account,
      error,
      connectors,
      connect,
      disconnect,
      txState,
      startTx,
      finishTx,
      failTx,
      clearTx
    }),
    [
      account,
      connectorId,
      connectors,
      connect,
      disconnect,
      error,
      status,
      txState,
      startTx,
      finishTx,
      failTx,
      clearTx
    ]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
