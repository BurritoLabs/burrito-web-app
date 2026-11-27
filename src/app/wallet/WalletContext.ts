import { createContext, useContext } from "react"
import type { SupportedChainKey } from "../config/chainConfig"

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error"
export type WalletConnectorId =
  | "burrito-native"
  | "burrito-extension"
  | "keplr"
  | "keplr-mobile"
  | "galaxy"
export type TxStatus = "idle" | "pending" | "unconfirmed" | "success" | "error" | "blocked"

export type TxState = {
  status: TxStatus
  hash?: string
  label?: string
  error?: string
  startedAt?: number
  chainKey?: SupportedChainKey
  address?: string
  hidden?: boolean
  phase?: "signing" | "confirming"
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
  walletReadyForTx: boolean
  walletPreparingForTx: boolean
  connectors: WalletConnector[]
  connect: (id: WalletConnectorId) => Promise<void>
  disconnect: () => Promise<void>
  prepareWalletForTx: () => Promise<boolean>
  txState: TxState
  startTx: (label?: string) => Promise<boolean>
  setTxPhase: (phase: "signing" | "confirming") => void
  showTxReceipt: () => void
  checkTxReceipt: () => Promise<void>
  acknowledgeTxReview: () => void
  finishTx: (hash?: string) => void
  failTx: (error?: unknown) => void
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
