import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react"
import type { ReactNode } from "react"
import { KEPLR_CHAIN_CONFIG } from "../chain"

type WalletStatus = "disconnected" | "connecting" | "connected" | "error"
type WalletConnectorId = "keplr" | "galaxy"

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
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      connectorId,
      account,
      error,
      connectors,
      connect,
      disconnect
    }),
    [account, connectorId, connectors, connect, disconnect, error, status]
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
