import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"
import {
  WalletContext,
  type TxState,
  type WalletConnector,
  type WalletConnectorId,
  type WalletContextValue,
  type WalletStatus
} from "./WalletContext"
import {
  CONNECTOR_META,
  forgetStoredWalletSession,
  getStoredWalletConnectorId,
  isWalletManualDisconnectStored,
  rememberWalletConnectorId,
  rememberWalletManualDisconnect
} from "./walletMeta"
import { isTouchWalletCapableBrowser } from "./walletPlatform"

const WalletRuntimeProvider = lazy(() => import("./WalletRuntimeProvider"))

type WalletWindow = Window & {
  keplr?: unknown
  galaxyStation?: unknown
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Wallet connection failed"

const getWalletWindow = () =>
  typeof window === "undefined" ? undefined : (window as WalletWindow)

const getFallbackConnectors = (): WalletConnector[] => {
  const walletWindow = getWalletWindow()
  const desktopKeplr = Boolean(walletWindow?.keplr)
  const desktopGalaxy =
    Boolean(walletWindow?.galaxyStation) &&
    !(walletWindow?.galaxyStation instanceof HTMLElement)

  return [
    {
      ...CONNECTOR_META.keplr,
      available: desktopKeplr
    },
    {
      ...CONNECTOR_META["keplr-mobile"],
      available: false
    },
    {
      ...CONNECTOR_META.galaxy,
      type: "extension",
      available: desktopGalaxy
    }
  ]
}

const getInitialStoredConnector = () => {
  if (isWalletManualDisconnectStored()) return undefined
  const stored = getStoredWalletConnectorId()
  if (stored === "keplr-mobile" && getWalletWindow()?.keplr) {
    return "keplr"
  }
  return stored === "keplr-mobile" ? undefined : stored
}

const shouldLoadWalletRuntime = () => {
  const walletWindow = getWalletWindow()
  if (walletWindow?.keplr) {
    return false
  }

  const stored = getStoredWalletConnectorId()
  if (stored === "keplr-mobile") {
    return true
  }

  return isTouchWalletCapableBrowser()
}

const WalletFallbackProvider = ({
  children,
  autoConnectId
}: {
  children: ReactNode
  autoConnectId?: WalletConnectorId
}) => {
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletContextValue["account"]>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const [walletPreparingForTx, setWalletPreparingForTx] = useState(false)
  const connectors = useMemo(() => getFallbackConnectors(), [])

  const reconnectConnector = useCallback(
    async (id: WalletConnectorId) => {
      setStatus("connecting")
      setConnectorId(id)
      setError(undefined)
      setAccount(undefined)
      rememberWalletConnectorId(id)

      if (id === "keplr-mobile") {
        setError("Keplr Mobile is available from mobile wallet-capable browsers.")
        setStatus("error")
        return
      }

      try {
        const { connectWalletConnector } = await import("./walletAdapters")
        const nextAccount = await connectWalletConnector(id)
        setAccount(nextAccount)
        setStatus("connected")
      } catch (connectError) {
        setError(getErrorMessage(connectError))
        setStatus("error")
      }
    },
    []
  )

  const connect = useCallback(
    async (id: WalletConnectorId) => {
      await reconnectConnector(id)
    },
    [reconnectConnector]
  )

  const disconnect = useCallback(async () => {
    if (connectorId) {
      try {
        const { disconnectWalletConnector } = await import("./walletAdapters")
        await disconnectWalletConnector(connectorId)
      } catch {
        // The local UI should still reset even when a wallet does not expose disconnect.
      }
    }
    setStatus("disconnected")
    setConnectorId(undefined)
    setAccount(undefined)
    setError(undefined)
    rememberWalletManualDisconnect()
    forgetStoredWalletSession()
  }, [connectorId])

  const prepareWalletForTx = useCallback(async () => {
    if (!connectorId || !account?.address) {
      setError("Connect wallet before submitting a transaction.")
      return false
    }

    setWalletPreparingForTx(true)
    setError(undefined)
    try {
      const { getSignerAddressForConnector } = await import("./walletAdapters")
      await getSignerAddressForConnector(connectorId)
      return true
    } catch (prepareError) {
      setError(getErrorMessage(prepareError))
      return false
    } finally {
      setWalletPreparingForTx(false)
    }
  }, [account?.address, connectorId])

  useEffect(() => {
    if (!autoConnectId) return
    if (isWalletManualDisconnectStored()) return
    if (status !== "disconnected") return
    if (!connectors.some((item) => item.id === autoConnectId && item.available)) {
      return
    }

    const timer = window.setTimeout(() => {
      void connect(autoConnectId)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [autoConnectId, connect, connectors, status])

  useEffect(() => {
    const reconnectStoredDesktopWallet = (id: WalletConnectorId) => {
      if (isWalletManualDisconnectStored()) {
        forgetStoredWalletSession()
        return
      }
      const stored = getStoredWalletConnectorId()
      if (stored !== id && connectorId !== id) return
      const connector = connectors.find((item) => item.id === id)
      if (!connector?.available) return

      window.setTimeout(() => {
        void reconnectConnector(id)
      }, 100)
    }

    const handleKeplrChange = () => reconnectStoredDesktopWallet("keplr")
    const handleGalaxyChange = () => reconnectStoredDesktopWallet("galaxy")

    window.addEventListener("keplr_keystorechange", handleKeplrChange)
    window.addEventListener("galaxy_station_wallet_change", handleGalaxyChange)
    window.addEventListener("galaxy_station_network_change", handleGalaxyChange)

    return () => {
      window.removeEventListener("keplr_keystorechange", handleKeplrChange)
      window.removeEventListener(
        "galaxy_station_wallet_change",
        handleGalaxyChange
      )
      window.removeEventListener(
        "galaxy_station_network_change",
        handleGalaxyChange
      )
    }
  }, [connectorId, connectors, reconnectConnector])

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      connectorId,
      account,
      error,
      walletReadyForTx: Boolean(connectorId && account?.address),
      walletPreparingForTx,
      connectors,
      connect,
      disconnect,
      prepareWalletForTx,
      txState,
      startTx: (label?: string) =>
        setTxState({
          status: "pending",
          label,
          startedAt: Date.now()
        }),
      finishTx: (hash?: string) =>
        setTxState((current) => ({
          status: "success",
          hash,
          label: current.label,
          startedAt: current.startedAt
        })),
      failTx: (txError?: string) =>
        setTxState((current) => ({
          status: "error",
          label: current.label,
          error: txError,
          startedAt: current.startedAt
        })),
      clearTx: () => setTxState({ status: "idle" })
    }),
    [
      account,
      connect,
      connectorId,
      connectors,
      disconnect,
      error,
      prepareWalletForTx,
      status,
      txState,
      walletPreparingForTx
    ]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

const WalletBoot = ({ children }: { children: ReactNode }) => {
  const [storedAutoConnectId] = useState(() => getInitialStoredConnector())
  const [loadWalletRuntime] = useState(() => shouldLoadWalletRuntime())

  if (loadWalletRuntime) {
    return (
      <Suspense
        fallback={
          <WalletFallbackProvider autoConnectId={storedAutoConnectId}>
            {children}
          </WalletFallbackProvider>
        }
      >
        <WalletRuntimeProvider>{children}</WalletRuntimeProvider>
      </Suspense>
    )
  }

  return (
    <WalletFallbackProvider autoConnectId={storedAutoConnectId}>
      {children}
    </WalletFallbackProvider>
  )
}

export default WalletBoot
