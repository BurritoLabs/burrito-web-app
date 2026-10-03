import { ChainProvider, useChain } from "@cosmos-kit/react-lite"
import { memo, useEffect, useMemo } from "react"
import { useAppChain } from "../appChainContext"
import { COSMOS_KIT_CHAIN_NAME_BY_KEY } from "./cosmosKitMeta"
import type { WalletRuntimePublisher, WalletRuntimeSnapshot } from "./walletRuntimeBridge"
import {
  COSMOS_KIT_ASSET_LISTS,
  COSMOS_KIT_CHAINS,
  COSMOS_KIT_WALLETS,
  getWalletConnectOptions
} from "./cosmosKit"

// Burrito owns the wallet UI, but useChain still requires a modal adapter.
const WalletModalBridge = () => <></>

const WalletChainBridge = ({
  publishRuntime
}: {
  publishRuntime: WalletRuntimePublisher
}) => {
  const { chainKey } = useAppChain()
  const {
    walletRepo,
    address,
    username,
    wallet,
    isWalletConnected,
    getOfflineSigner,
    getSigningStargateClient,
    signAndBroadcast
  // The persistent controller owns connects and read-only restoration. The
  // hook's automatic connect on a chain change would bypass its attempt guard.
  } = useChain(COSMOS_KIT_CHAIN_NAME_BY_KEY[chainKey], false)
  const currentWallet = walletRepo.current
  // useChain returns a new object on every render. Only publish actual SDK
  // changes, or updating the persistent owner would feed back into this bridge.
  const snapshot = useMemo<WalletRuntimeSnapshot>(() => ({
    chainKey,
    chain: {
      walletRepo,
      currentWallet,
      address,
      username,
      wallet,
      isWalletConnected,
      getOfflineSigner,
      getSigningStargateClient,
      signAndBroadcast
    }
  }), [
    chainKey,
    walletRepo,
    currentWallet,
    address,
    username,
    wallet,
    isWalletConnected,
    getOfflineSigner,
    getSigningStargateClient,
    signAndBroadcast
  ])

  useEffect(() => {
    publishRuntime(snapshot)
  }, [publishRuntime, snapshot])

  useEffect(() => () => publishRuntime(undefined), [publishRuntime])

  return null
}

const WalletRuntimeProvider = memo(function WalletRuntimeProvider({
  publishRuntime
}: {
  publishRuntime: WalletRuntimePublisher
}) {
  const walletConnectOptions = useMemo(getWalletConnectOptions, [])
  return (
    <ChainProvider
      chains={COSMOS_KIT_CHAINS}
      assetLists={COSMOS_KIT_ASSET_LISTS}
      wallets={COSMOS_KIT_WALLETS}
      walletConnectOptions={walletConnectOptions}
      walletModal={WalletModalBridge}
      throwErrors={false}
    >
      <WalletChainBridge publishRuntime={publishRuntime} />
    </ChainProvider>
  )
})

export default WalletRuntimeProvider
