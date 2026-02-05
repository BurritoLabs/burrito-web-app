import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"
import type { ReactNode } from "react"
import { KEPLR_CHAIN_CONFIG } from "../chain"

type WalletStatus = "disconnected" | "connecting" | "connected" | "error"
type WalletConnectorId = "keplr" | "galaxy"
type TxStatus = "idle" | "pending" | "success" | "error"

type TxState = {
  status: TxStatus
  hash?: string
  label?: string
  error?: string
}

type WalletAccount = {
  address: string
  name?: string
}

type WalletConnector = {
  id: WalletConnectorId
  label: string
  type: "extension" | "mobile"
  available: boolean
}

type WalletContextValue = {
  status: WalletStatus
  connectorId?: WalletConnectorId
  account?: WalletAccount
  error?: string
  connectors: WalletConnector[]
  connect: (id: WalletConnectorId) => Promise<void>
  disconnect: () => Promise<void>
  txState: TxState
  startTx: (label?: string) => void
  finishTx: (hash?: string) => void
  failTx: (error?: string) => void
}

type InjectedWallet = {
  enable: (chainId: string) => Promise<void>
  getKey: (chainId: string) => Promise<{ bech32Address: string; name?: string }>
  experimentalSuggestChain?: (config: unknown) => Promise<void>
}

type InjectedWallets = {
  keplr?: InjectedWallet
  station?: InjectedWallet
  galaxyStation?: InjectedWallet
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined)
const STORAGE_KEY = "burritoWalletConnector"

const getInjectedWallets = (): InjectedWallets => {
  if (typeof window === "undefined") return {}
  return window as Window & InjectedWallets
}

const formatWalletError = (error: unknown) =>
  error instanceof Error ? error.message : "Wallet connection failed"

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletAccount>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false)

  const connectors = useMemo<WalletConnector[]>(() => {
    const injected = getInjectedWallets()
    const base: WalletConnector[] = [
      {
        id: "keplr",
        label: "Keplr",
        type: "extension",
        available: Boolean(injected.keplr)
      },
      {
        id: "galaxy",
        label: "Galaxy Station",
        type: "extension",
        available: Boolean(injected.station ?? injected.galaxyStation)
      }
    ]
    return base
  }, [])

  const connectInjected = useCallback(
    async (wallet: InjectedWallet, id: WalletConnectorId) => {
      if (wallet.experimentalSuggestChain) {
        await wallet.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
      }
      await wallet.enable(KEPLR_CHAIN_CONFIG.chainId)
      const key = await wallet.getKey(KEPLR_CHAIN_CONFIG.chainId)
      setAccount({ address: key.bech32Address, name: key.name })
      setConnectorId(id)
    },
    []
  )

  const connect = useCallback(
    async (id: WalletConnectorId) => {
      setStatus("connecting")
      setError(undefined)
      try {
        const injected = getInjectedWallets()
        if (id === "keplr") {
          if (!injected.keplr) throw new Error("Keplr not installed")
          await connectInjected(injected.keplr, id)
        } else if (id === "galaxy") {
          const wallet = injected.station ?? injected.galaxyStation
          if (!wallet) throw new Error("Galaxy Station not installed")
          await connectInjected(wallet, id)
        }
        setStatus("connected")
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, id)
        }
      } catch (err) {
        setStatus("error")
        setError(formatWalletError(err))
      }
    },
    [connectInjected]
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
    setTxState({ status: "pending", label })
  }, [])

  const finishTx = useCallback((hash?: string) => {
    setTxState({ status: "success", hash })
  }, [])

  const failTx = useCallback((err?: string) => {
    setTxState({ status: "error", error: err })
  }, [])

  useEffect(() => {
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
    if (autoConnectAttempted) return
    if (typeof window === "undefined") {
      setAutoConnectAttempted(true)
      return
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as WalletConnectorId | null
    if (!stored) {
      setAutoConnectAttempted(true)
      return
    }
    const injected = getInjectedWallets()
    const available =
      stored === "keplr"
        ? injected.keplr
        : injected.station ?? injected.galaxyStation
    if (!available) {
      setAutoConnectAttempted(true)
      return
    }
    void connect(stored).finally(() => setAutoConnectAttempted(true))
  }, [autoConnectAttempted, connect])

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
      failTx
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
      failTx
    ]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export const useWallet = () => {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider")
  }
  return context
}
