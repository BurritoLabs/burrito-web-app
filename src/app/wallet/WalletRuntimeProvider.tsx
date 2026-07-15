import { ChainProvider } from "@cosmos-kit/react-lite"
import type { ReactNode } from "react"
import type { WalletConnectorId } from "./WalletContext"
import { WalletProvider } from "./WalletProvider"
import {
  COSMOS_KIT_ASSET_LISTS,
  COSMOS_KIT_CHAINS,
  COSMOS_KIT_WALLETS,
  getWalletConnectOptions
} from "./cosmosKit"

// Burrito owns the wallet UI, but useChain still requires a modal adapter.
const WalletModalBridge = () => <></>

const WalletRuntimeProvider = ({
  children,
  connectOnMountId
}: {
  children: ReactNode
  connectOnMountId?: WalletConnectorId
}) => (
  <ChainProvider
    chains={COSMOS_KIT_CHAINS}
    assetLists={COSMOS_KIT_ASSET_LISTS}
    wallets={COSMOS_KIT_WALLETS}
    walletConnectOptions={getWalletConnectOptions()}
    walletModal={WalletModalBridge}
    throwErrors={false}
  >
    <WalletProvider connectOnMountId={connectOnMountId}>
      {children}
    </WalletProvider>
  </ChainProvider>
)

export default WalletRuntimeProvider
