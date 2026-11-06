import type { ChainContext, ChainWalletBase } from "@cosmos-kit/core"
import type { SupportedChainKey } from "../config/chainConfig"

// Types only: the persistent connection owner must not import the SDK runtime.
export type WalletRuntimeChain = Pick<
  ChainContext,
  | "walletRepo"
  | "address"
  | "username"
  | "wallet"
  | "isWalletConnected"
  | "getOfflineSigner"
  | "getSigningStargateClient"
  | "signAndBroadcast"
> & {
  currentWallet: ChainWalletBase | undefined
}

export type WalletRuntimeSnapshot = {
  chainKey: SupportedChainKey
  chain: WalletRuntimeChain
}

export type WalletRuntimePublisher = (
  snapshot: WalletRuntimeSnapshot | undefined
) => void
