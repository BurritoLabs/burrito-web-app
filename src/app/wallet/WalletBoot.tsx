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
  WALLET_CONNECTOR_STORAGE_KEY,
  getStoredWalletConnectorId
} from "./walletMeta"
import {
  isLikelyMobileBrowser,
  isTouchWalletCapableBrowser
} from "./walletPlatform"

const WalletRuntimeProvider = lazy(() => import("./WalletRuntimeProvider"))

type WalletWindow = Window & {
  keplr?: unknown
  galaxyStation?: unknown
}

const getWalletWindow = () =>
  typeof window === "undefined" ? undefined : (window as WalletWindow)

const getFallbackConnectors = (): WalletConnector[] => {
  const walletWindow = getWalletWindow()
  const desktopKeplr = Boolean(walletWindow?.keplr)
  const desktopGalaxy = Boolean(walletWindow?.galaxyStation)
  const mobileCapable =
    !desktopKeplr &&
    (isLikelyMobileBrowser() || isTouchWalletCapableBrowser())

  return [
    {
      ...CONNECTOR_META.keplr,
      available: desktopKeplr
    },
    {
      ...CONNECTOR_META["keplr-mobile"],
      available: mobileCapable
    },
    {
      ...CONNECTOR_META.galaxy,
      type: mobileCapable && !desktopGalaxy ? "mobile" : "extension",
      available: desktopGalaxy || mobileCapable
    }
  ]
}

const WalletFallbackProvider = ({
  children,
  onRuntimeRequest
}: {
  children: ReactNode
  onRuntimeRequest: () => void
}) => {
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [error, setError] = useState<string>()
  const txState = useMemo<TxState>(() => ({ status: "idle" }), [])
  const connectors = useMemo(() => getFallbackConnectors(), [])

  const connect = useCallback(
    async (id: WalletConnectorId) => {
      setStatus("connecting")
      setConnectorId(id)
      setError(undefined)
      try {
        window.localStorage.setItem(WALLET_CONNECTOR_STORAGE_KEY, id)
      } catch {
        // Storage can be unavailable in private browsing; runtime still loads.
      }
      onRuntimeRequest()
    },
    [onRuntimeRequest]
  )

  const disconnect = useCallback(async () => {
    setStatus("disconnected")
    setConnectorId(undefined)
    setError(undefined)
    try {
      window.localStorage.removeItem(WALLET_CONNECTOR_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      connectorId,
      account: undefined,
      error,
      connectors,
      connect,
      disconnect,
      txState,
      startTx: () => undefined,
      finishTx: () => undefined,
      failTx: () => undefined,
      clearTx: () => undefined
    }),
    [connect, connectorId, connectors, disconnect, error, status, txState]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

const WalletBoot = ({ children }: { children: ReactNode }) => {
  const [hasStoredConnector] = useState(() => Boolean(getStoredWalletConnectorId()))
  const [runtimeRequested, setRuntimeRequested] = useState(false)
  const requestRuntime = useCallback(() => setRuntimeRequested(true), [])

  useEffect(() => {
    if (!hasStoredConnector || runtimeRequested) return

    const loadRuntime = () => setRuntimeRequested(true)
    const walletWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number }
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (walletWindow.requestIdleCallback) {
      const handle = walletWindow.requestIdleCallback(loadRuntime, {
        timeout: 1800
      })
      return () => walletWindow.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(loadRuntime, 900)
    return () => window.clearTimeout(timer)
  }, [hasStoredConnector, runtimeRequested])

  if (!runtimeRequested) {
    return (
      <WalletFallbackProvider onRuntimeRequest={requestRuntime}>
        {children}
      </WalletFallbackProvider>
    )
  }

  return (
    <Suspense
      fallback={
        <WalletFallbackProvider onRuntimeRequest={requestRuntime}>
          {children}
        </WalletFallbackProvider>
      }
    >
      <WalletRuntimeProvider>{children}</WalletRuntimeProvider>
    </Suspense>
  )
}

export default WalletBoot
