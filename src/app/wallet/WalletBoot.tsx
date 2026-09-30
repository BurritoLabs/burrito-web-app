import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
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
import { getBurritoNativeConnector, invalidateBurritoNativeSession } from "./burritoNativeWallet"
import {
  BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT,
  getBurritoExtensionConnector,
  getBurritoExtensionConnectionErrorMessage,
  invalidateBurritoExtensionSession
} from "./burritoExtensionWallet"
import { classifyTxError, recordTxDiagnostic } from "../tx/txDiagnostics"
import { reportRuntimeError } from "../feedback/runtimeErrorReporter"
import { loadWalletRuntimeProvider } from "./walletRuntimeLoader"
import { useAppChain } from "../appChainContext"

const WalletRuntimeProvider = lazy(loadWalletRuntimeProvider)

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
    getBurritoNativeConnector(),
    getBurritoExtensionConnector(),
    {
      ...CONNECTOR_META.keplr,
      available: desktopKeplr
    },
    {
      ...CONNECTOR_META["keplr-mobile"],
      available: isTouchWalletCapableBrowser()
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

  return getStoredWalletConnectorId() === "keplr-mobile"
}

class WalletRuntimeErrorBoundary extends Component<
  {
    children: ReactNode
    onError: (error: Error, info: ErrorInfo) => void
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const WalletFallbackProvider = ({
  children,
  autoConnectId,
  onRuntimeRequested
}: {
  children: ReactNode
  autoConnectId?: WalletConnectorId
  onRuntimeRequested?: (id: WalletConnectorId) => void
}) => {
  const { chainKey } = useAppChain()
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletContextValue["account"]>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const [walletPreparingForTx, setWalletPreparingForTx] = useState(false)
  const [connectorRefreshNonce, setConnectorRefreshNonce] = useState(0)
  const currentTxLabelRef = useRef<string | undefined>(undefined)
  const currentTxStartedAtRef = useRef<number | undefined>(undefined)
  const previousChainKeyRef = useRef(chainKey)
  const connectionAttemptRef = useRef(0)
  const pendingConnectorRef = useRef<WalletConnectorId | undefined>(undefined)
  const selectedConnectorRef = useRef<WalletConnectorId | undefined>(undefined)
  const connectors = useMemo(() => {
    void connectorRefreshNonce
    return getFallbackConnectors()
  }, [connectorRefreshNonce])

  useEffect(() => () => {
    connectionAttemptRef.current += 1
    if (selectedConnectorRef.current === "burrito-extension") {
      invalidateBurritoExtensionSession()
    }
    pendingConnectorRef.current = undefined
  }, [])

  useEffect(() => {
    const refreshNativeConnector = () => {
      setConnectorRefreshNonce((current) => current + 1)
    }
    window.addEventListener("burrito:native-ready", refreshNativeConnector)
    window.addEventListener("burrito:wallet-ready", refreshNativeConnector)
    return () => {
      window.removeEventListener("burrito:native-ready", refreshNativeConnector)
      window.removeEventListener("burrito:wallet-ready", refreshNativeConnector)
    }
  }, [])

  const reconnectConnector = useCallback(
    async (id: WalletConnectorId, requestApproval = true) => {
      if (!requestApproval && (isWalletManualDisconnectStored() ||
        (selectedConnectorRef.current && selectedConnectorRef.current !== id))) return
      // Repeated clicks must not invalidate an approval already in progress.
      if (pendingConnectorRef.current) return
      const attempt = ++connectionAttemptRef.current
      if (id !== "burrito-extension" && selectedConnectorRef.current === "burrito-extension") {
        invalidateBurritoExtensionSession()
      }
      if (
        id === "burrito-native" ||
        pendingConnectorRef.current === "burrito-native" ||
        getStoredWalletConnectorId() === "burrito-native"
      ) invalidateBurritoNativeSession()
      pendingConnectorRef.current = id
      selectedConnectorRef.current = id
      setStatus("connecting")
      setConnectorId(id)
      setError(undefined)
      setAccount(undefined)

      if (id === "keplr-mobile") {
        onRuntimeRequested?.(id)
        return
      }

      try {
        const { connectWalletConnector } = await import("./walletAdapters")
        if (attempt !== connectionAttemptRef.current) return
        const nextAccount = await connectWalletConnector(id, { requestApproval })
        if (attempt !== connectionAttemptRef.current) return
        setAccount(nextAccount)
        setStatus("connected")
        rememberWalletConnectorId(id)
      } catch (connectError) {
        if (attempt !== connectionAttemptRef.current) return
        setError(id === "burrito-extension"
          ? getBurritoExtensionConnectionErrorMessage(connectError)
          : getErrorMessage(connectError))
        setStatus("error")
      } finally {
        if (attempt === connectionAttemptRef.current) pendingConnectorRef.current = undefined
      }
    },
    [onRuntimeRequested]
  )

  const connect = useCallback(
    async (id: WalletConnectorId) => {
      await reconnectConnector(id)
    },
    [reconnectConnector]
  )

  useEffect(() => {
    if (previousChainKeyRef.current === chainKey) return

    previousChainKeyRef.current = chainKey
    const reconnectId = pendingConnectorRef.current ?? connectorId ?? getStoredWalletConnectorId()
    connectionAttemptRef.current += 1
    pendingConnectorRef.current = undefined
    if (reconnectId === "burrito-extension") invalidateBurritoExtensionSession()
    if (reconnectId === "burrito-native") invalidateBurritoNativeSession()
    setAccount(undefined)
    setError(undefined)
    setStatus("disconnected")
    setTxState({ status: "idle" })
    if (isWalletManualDisconnectStored()) return

    if (!reconnectId || reconnectId === "keplr-mobile") return

    // A chain change restores an existing grant; it never opens a new approval.
    void reconnectConnector(reconnectId, false)
  }, [chainKey, connectorId, reconnectConnector])

  const disconnect = useCallback(async () => {
    const disconnectId = pendingConnectorRef.current ?? connectorId
    const attempt = ++connectionAttemptRef.current
    pendingConnectorRef.current = undefined
    if (disconnectId === "burrito-extension") invalidateBurritoExtensionSession()
    if (disconnectId === "burrito-native") invalidateBurritoNativeSession()
    setStatus("disconnected")
    selectedConnectorRef.current = undefined
    setConnectorId(undefined)
    setAccount(undefined)
    setError(undefined)
    setTxState({ status: "idle" })
    rememberWalletManualDisconnect()
    forgetStoredWalletSession()
    if (disconnectId) {
      try {
        const { disconnectWalletConnector } = await import("./walletAdapters")
        if (attempt !== connectionAttemptRef.current) return
        await disconnectWalletConnector(disconnectId)
      } catch {
        // The local UI should still reset even when a wallet does not expose disconnect.
      }
    }
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
      void reconnectConnector(autoConnectId, false)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [autoConnectId, reconnectConnector, connectors, status])

  useEffect(() => {
    const reconnectTimers = new Set<number>()
    const reconnectStoredDesktopWallet = (id: WalletConnectorId) => {
      if (isWalletManualDisconnectStored()) {
        forgetStoredWalletSession()
        return
      }
      const stored = getStoredWalletConnectorId()
      if (stored !== id && connectorId !== id) return
      const selected = pendingConnectorRef.current ?? selectedConnectorRef.current
      if (selected && selected !== id) return
      const connector = connectors.find((item) => item.id === id)
      if (!connector?.available) return

      const attempt = connectionAttemptRef.current
      const timer = window.setTimeout(() => {
        reconnectTimers.delete(timer)
        if (attempt !== connectionAttemptRef.current) return
        const current = pendingConnectorRef.current ?? selectedConnectorRef.current
        if (current && current !== id) return
        void reconnectConnector(id)
      }, 100)
      reconnectTimers.add(timer)
    }

    const handleKeplrChange = () => reconnectStoredDesktopWallet("keplr")
    const handleGalaxyChange = () => reconnectStoredDesktopWallet("galaxy")
    const handleBurritoChange = () => {
      const selected = pendingConnectorRef.current ?? selectedConnectorRef.current ??
        connectorId ?? getStoredWalletConnectorId()
      if (selected !== "burrito-extension") return
      connectionAttemptRef.current += 1
      pendingConnectorRef.current = undefined
      invalidateBurritoExtensionSession()
      selectedConnectorRef.current = undefined
      rememberWalletManualDisconnect()
      forgetStoredWalletSession()
      setAccount(undefined)
      setConnectorId(undefined)
      setStatus("disconnected")
      setError(undefined)
      setTxState({ status: "idle" })
    }

    window.addEventListener(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT, handleBurritoChange)
    window.addEventListener("keplr_keystorechange", handleKeplrChange)
    window.addEventListener("galaxy_station_wallet_change", handleGalaxyChange)
    window.addEventListener("galaxy_station_network_change", handleGalaxyChange)

    return () => {
      reconnectTimers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT, handleBurritoChange)
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

  const startTx = useCallback(
    (label?: string) => {
      const startedAt = Date.now()
      currentTxLabelRef.current = label
      currentTxStartedAtRef.current = startedAt
      recordTxDiagnostic({
        phase: "start",
        label,
        connectorId,
        accountAddress: account?.address
      })
      setTxState({ status: "pending", label, startedAt })
    },
    [account?.address, connectorId]
  )

  const finishTx = useCallback(
    (hash?: string) => {
      const durationMs = currentTxStartedAtRef.current
        ? Date.now() - currentTxStartedAtRef.current
        : undefined
      recordTxDiagnostic({
        phase: "success",
        label: currentTxLabelRef.current,
        connectorId,
        accountAddress: account?.address,
        txHash: hash,
        durationMs
      })
      currentTxLabelRef.current = undefined
      currentTxStartedAtRef.current = undefined
      setTxState({ status: "success", hash })
    },
    [account?.address, connectorId]
  )

  const failTx = useCallback(
    (txError?: unknown) => {
      const classified = classifyTxError(txError, "Transaction failed")
      const durationMs = currentTxStartedAtRef.current
        ? Date.now() - currentTxStartedAtRef.current
        : undefined
      recordTxDiagnostic({
        phase: "failure",
        label: currentTxLabelRef.current,
        connectorId,
        accountAddress: account?.address,
        category: classified.category,
        message: classified.userMessage,
        rawMessage: classified.rawMessage,
        durationMs
      })
      currentTxLabelRef.current = undefined
      currentTxStartedAtRef.current = undefined
      setTxState({ status: "error", error: classified.userMessage })
    },
    [account?.address, connectorId]
  )

  const clearTx = useCallback(() => setTxState({ status: "idle" }), [])

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
      startTx,
      finishTx,
      failTx,
      clearTx
    }),
    [
      account,
      connect,
      connectorId,
      connectors,
      disconnect,
      error,
      clearTx,
      failTx,
      finishTx,
      prepareWalletForTx,
      startTx,
      status,
      txState,
      walletPreparingForTx
    ]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

const WalletBoot = ({ children }: { children: ReactNode }) => {
  const [storedAutoConnectId] = useState(() => getInitialStoredConnector())
  const [connectOnMountId, setConnectOnMountId] = useState<WalletConnectorId>()
  const [loadWalletRuntime, setLoadWalletRuntime] = useState(() =>
    shouldLoadWalletRuntime()
  )
  const handleWalletRuntimeError = useCallback(
    (error: Error, info: ErrorInfo) => {
      reportRuntimeError({
        kind: "react",
        error,
        componentStack: info.componentStack ?? undefined
      })
      forgetStoredWalletSession()
      setConnectOnMountId(undefined)
      setLoadWalletRuntime(false)
    },
    []
  )

  if (loadWalletRuntime) {
    return (
      <WalletRuntimeErrorBoundary onError={handleWalletRuntimeError}>
        <Suspense
          fallback={
            <WalletFallbackProvider autoConnectId={storedAutoConnectId}>
              {children}
            </WalletFallbackProvider>
          }
        >
          <WalletRuntimeProvider connectOnMountId={connectOnMountId}>
            {children}
          </WalletRuntimeProvider>
        </Suspense>
      </WalletRuntimeErrorBoundary>
    )
  }

  return (
    <WalletFallbackProvider
      autoConnectId={storedAutoConnectId}
      onRuntimeRequested={(id) => {
        setConnectOnMountId(id)
        setLoadWalletRuntime(true)
      }}
    >
      {children}
    </WalletFallbackProvider>
  )
}

export default WalletBoot
