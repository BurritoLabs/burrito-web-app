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
import {
  isLikelyMobileBrowser,
  isTouchWalletCapableBrowser
} from "./walletPlatform"

const STORAGE_KEY = "burritoWalletConnector"
const KNOWN_CONNECTOR_IDS: WalletConnectorId[] = ["keplr", "galaxy"]

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

  const isMobileBrowser = useMemo(() => isLikelyMobileBrowser(), [])
  const supportsMobileWallets = useMemo(() => isTouchWalletCapableBrowser(), [])
  const currentCosmosWalletName = cosmosChain.walletRepo.current?.walletName
  const activeCosmosConnectorId = currentCosmosWalletName
    ? COSMOS_WALLET_NAME_TO_CONNECTOR_ID[currentCosmosWalletName]
    : undefined

  const refreshConnectors = useCallback(() => {
    setConnectorRefreshNonce((current) => current + 1)
  }, [])

  const getCosmosWalletCandidates = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      const wallets = cosmosChain.walletRepo.wallets
      const extensionAliases = [config.extensionWalletName, config.label]
      const mobileAliases = [
        config.mobileWalletName,
        `${config.label} Mobile`,
        `${config.label} Wallet Mobile`
      ]

      return {
        extensionWallet:
          cosmosChain.walletRepo.getWallet(config.extensionWalletName) ??
          wallets.find((wallet) => matchesWalletAlias(wallet, extensionAliases)),
        mobileWallet:
          cosmosChain.walletRepo.getWallet(config.mobileWalletName) ??
          wallets.find((wallet) => matchesWalletAlias(wallet, mobileAliases))
      }
    },
    [cosmosChain.walletRepo]
  )

  const getPreferredCosmosWallet = useCallback(
    (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      options?: { preferConnected?: boolean }
    ) => {
      const { extensionWallet, mobileWallet } = getCosmosWalletCandidates(id)
      const connectedWallet =
        [extensionWallet, mobileWallet].find(
          (wallet) => wallet && !wallet.isWalletDisconnected && !wallet.isWalletNotExist
        ) ?? undefined

      if (options?.preferConnected && connectedWallet) {
        return connectedWallet
      }

      if (isMobileBrowser && mobileWallet) {
        return mobileWallet
      }

      if (isWalletReady(extensionWallet)) {
        return extensionWallet
      }

      if (supportsMobileWallets && mobileWallet) {
        if (mobileWallet) {
          return mobileWallet
        }
      }

      return extensionWallet ?? mobileWallet
    },
    [getCosmosWalletCandidates, isMobileBrowser, supportsMobileWallets]
  )

  const getCosmosConnector = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS): WalletConnector => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      const { extensionWallet, mobileWallet } = getCosmosWalletCandidates(id)
      const extensionAvailable = isWalletReady(extensionWallet)
      const mobileAvailable = Boolean(mobileWallet) && supportsMobileWallets
      const shouldUseMobileType =
        mobileAvailable && (isMobileBrowser || !extensionAvailable)

      return {
        id,
        label: config.label,
        type: shouldUseMobileType ? "mobile" : "extension",
        available: extensionAvailable || mobileAvailable
      }
    },
    [getCosmosWalletCandidates, isMobileBrowser, supportsMobileWallets]
  )

  const connectCosmosConnector = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const wallet = getPreferredCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} not available`)
      }
      await wallet.connect(true)
      const isMobileWallet =
        wallet.walletName === COSMOS_CONNECTOR_CONFIGS[id].mobileWalletName
      if (isMobileWallet) {
        return undefined
      }
      return buildWalletAccount(wallet)
    },
    [getPreferredCosmosWallet]
  )

  const getCosmosOfflineSigner = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const wallet =
        getPreferredCosmosWallet(id, { preferConnected: true }) ??
        getPreferredCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }
      if (wallet.isWalletDisconnected) {
        await wallet.connect(false)
      }
      if (!wallet.offlineSigner) {
        await wallet.initOfflineSigner()
      }
      if (!wallet.offlineSigner) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }
      return wallet.offlineSigner
    },
    [getPreferredCosmosWallet]
  )

  const connectors = useMemo(
    () => {
      void connectorRefreshNonce
      return [getCosmosConnector("keplr"), getGalaxyConnector()]
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
  }, [connectCosmosConnector, getCosmosConnector, getCosmosOfflineSigner])

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
