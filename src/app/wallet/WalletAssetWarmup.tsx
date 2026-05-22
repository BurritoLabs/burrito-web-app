import { useWallet } from "./WalletContext"
import { useWalletAssets } from "./useWalletAssets"

const WalletAssetWarmupRunner = ({ accountAddress }: { accountAddress: string }) => {
  useWalletAssets(accountAddress)
  return null
}

const WalletAssetWarmup = () => {
  const { account } = useWallet()

  if (!account?.address) {
    return null
  }

  return <WalletAssetWarmupRunner accountAddress={account.address} />
}

export default WalletAssetWarmup
