import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react"
import type { ReactNode } from "react"
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
  getWalletConnectors
} from "./walletAdapters"
const STORAGE_KEY = "burritoWalletConnector"
const KNOWN_CONNECTOR_IDS: WalletConnectorId[] = [
  "keplr",
  "leap",
  "galaxy",
  "trust",
  "luncdash"
]

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

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletAccount>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const [connectors, setConnectors] = useState<WalletConnector[]>(() =>
    getWalletConnectors()
  )
  const [pendingAutoConnectId] = useState<WalletConnectorId | undefined>(
    () => getStoredConnectorId()
  )
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(
    () => !pendingAutoConnectId
  )

  const refreshConnectors = useCallback(() => {
    setConnectors((current) => {
      const next = getWalletConnectors()
      const unchanged =
        current.length === next.length &&
        current.every(
          (item, index) =>
            item.id === next[index]?.id &&
            item.available === next[index]?.available &&
            item.type === next[index]?.type &&
            item.label === next[index]?.label
        )
      return unchanged ? current : next
    })
  }, [])

  const connect = useCallback(
    async (id: WalletConnectorId) => {
      setStatus("connecting")
      setError(undefined)
      try {
        const nextAccount = await connectWalletConnector(id)
        setAccount(nextAccount)
        setConnectorId(id)
        setStatus("connected")
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, id)
        }
      } catch (err) {
        setStatus("error")
        setError(formatWalletError(err))
      }
    },
    []
  )

  const disconnect = useCallback(async () => {
    setAccount(undefined)
    setConnectorId(undefined)
    setError(undefined)
    setStatus("disconnected")
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

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
    if (
      autoConnectAttempted ||
      !pendingAutoConnectId ||
      !pendingAutoConnectAvailable
    )
      return
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
    pendingAutoConnectId
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
