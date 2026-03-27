import { useChain } from "@cosmos-kit/react"
import type { ChainWalletBase } from "@cosmos-kit/core"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
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
  connectWalletConnector,
  disconnectWalletConnector,
  registerWalletAdapterRuntime
} from "./walletAdapters"
import { isTouchWalletCapableBrowser } from "./walletPlatform"

const STORAGE_KEY = "burritoWalletConnector"
const KNOWN_CONNECTOR_IDS: WalletConnectorId[] = [
  "keplr",
  "keplr-mobile",
  "galaxy"
]
const MOBILE_CONNECT_HANDOFF_TIMEOUT_MS = 90

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

const isKnownConnectorId = (
  value: string | null
): value is WalletConnectorId => KNOWN_CONNECTOR_IDS.includes(value as WalletConnectorId)

const getStoredConnectorId = () => {
  if (typeof window === "undefined") return undefined
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!isKnownConnectorId(stored)) {
    return undefined
  }
  return stored
}

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

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const cosmosChain = useChain(COSMOS_KIT_CHAIN_NAME)
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletAccount>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const [connectorRefreshNonce, setConnectorRefreshNonce] = useState(0)
  const [pendingAutoConnectId] = useState<WalletConnectorId | undefined>(
    () => getStoredConnectorId()
  )
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(
    () => !pendingAutoConnectId
  )

  const supportsMobileWallets = useMemo(() => isTouchWalletCapableBrowser(), [])
  const currentCosmosWalletName = cosmosChain.walletRepo.current?.walletName
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
      const wallet = getCosmosWallet(id)
      const available =
        config.type === "mobile"
          ? Boolean(wallet) && supportsMobileWallets
          : isWalletReady(wallet)

      return {
        id,
        label: config.label,
        type: config.type,
        available
      }
    },
    [getCosmosWallet, supportsMobileWallets]
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
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const activeWallet = cosmosChain.walletRepo.current
      const shouldUseChainSigner =
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
        const nextAccount = isCosmosConnectorId(id)
          ? await connectCosmosConnector(id)
          : await connectWalletConnector(id)
        setConnectorId(id)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, id)
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
    [connectCosmosConnector]
  )

  const disconnect = useCallback(async () => {
    if (
      connectorId &&
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
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [connectorId, cosmosChain.walletRepo])

  const startTx = useCallback((label?: string) => {
    setTxState({ status: "pending", label, startedAt: Date.now() })
  }, [])

  const finishTx = useCallback((hash?: string) => {
    setTxState({ status: "success", hash })
  }, [])

  const failTx = useCallback((err?: string) => {
    setTxState({ status: "error", error: err })
  }, [])

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
        isCosmosConnectorId(id) ? await connectCosmosConnector(id) : undefined,
      getOfflineSigner: async (id) =>
        isCosmosConnectorId(id) ? await getCosmosOfflineSigner(id) : undefined
    })
    return () => {
      registerWalletAdapterRuntime(undefined)
    }
  }, [
    connectCosmosConnector,
    cosmosChain.isWalletConnected,
    cosmosChain.walletRepo,
    getCosmosConnector,
    getCosmosOfflineSigner
  ])

  useEffect(() => {
    if (!activeCosmosConnectorId || !cosmosChain.isWalletConnected || !cosmosChain.address) {
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
        window.localStorage.setItem(STORAGE_KEY, activeCosmosConnectorId)
      }
      if (!autoConnectAttempted) {
        setAutoConnectAttempted(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    activeCosmosConnectorId,
    autoConnectAttempted,
    cosmosChain.address,
    cosmosChain.isWalletConnected,
    cosmosChain.username,
    cosmosChain.wallet?.prettyName
  ])

  useEffect(() => {
    if (!connectorId || !isCosmosConnectorId(connectorId)) return
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
    status
  ])

  const pendingAutoConnectAvailable = useMemo(
    () =>
      Boolean(
        pendingAutoConnectId &&
          connectors.some(
            (connector) =>
              connector.id === pendingAutoConnectId && connector.available
          )
      ),
    [connectors, pendingAutoConnectId]
  )

  useEffect(() => {
    if (autoConnectAttempted || !pendingAutoConnectId) return
    if (!pendingAutoConnectAvailable) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void connect(pendingAutoConnectId).finally(() => {
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
    pendingAutoConnectAvailable,
    pendingAutoConnectId,
    supportsMobileWallets
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
