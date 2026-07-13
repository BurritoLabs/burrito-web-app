import { ChainProvider } from "@cosmos-kit/react-lite"
import type { ReactNode } from "react"
import { WalletProvider } from "./WalletProvider"
import {
  COSMOS_KIT_ASSET_LISTS,
  COSMOS_KIT_CHAINS,
  COSMOS_KIT_WALLETS,
  getWalletConnectOptions
} from "./cosmosKit"

const WalletRuntimeProvider = ({ children }: { children: ReactNode }) => (
  <ChainProvider
    chains={COSMOS_KIT_CHAINS}
    assetLists={COSMOS_KIT_ASSET_LISTS}
    wallets={COSMOS_KIT_WALLETS}
    walletConnectOptions={getWalletConnectOptions()}
    throwErrors={false}
  >
    <WalletProvider>{children}</WalletProvider>
  </ChainProvider>
)

export default WalletRuntimeProvider
