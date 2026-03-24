import { createContext, useContext } from "react"

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error"
export type WalletConnectorId =
  | "keplr"
  | "leap"
  | "galaxy"
  | "trust"
  | "luncdash"
export type TxStatus = "idle" | "pending" | "success" | "error"

export type TxState = {
  status: TxStatus
  hash?: string
  label?: string
  error?: string
  startedAt?: number
}

export type WalletAccount = {
  address: string
  name?: string
}

export type WalletConnector = {
  id: WalletConnectorId
  label: string
  type: "extension" | "mobile"
  available: boolean
}

export type WalletContextValue = {
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
  clearTx: () => void
}

export const WalletContext = createContext<WalletContextValue | undefined>(undefined)

export const useWallet = () => {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider")
  }
  return context
}
