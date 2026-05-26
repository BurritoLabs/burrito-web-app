import { TERRA_ADDRESS_PATTERN } from "./walletPanelUtils"

type WalletSwapAsset = {
  denom: string
  kind?: "cw20" | "native" | string
}

export const getWalletSwapAssetId = (asset: WalletSwapAsset) => {
  const denom = asset.denom.trim()
  const isCw20 = asset.kind === "cw20" || TERRA_ADDRESS_PATTERN.test(denom)
  return isCw20 ? `cw20:${denom.toLowerCase()}` : `native:${denom}`
}

export const getWalletSwapPath = (asset: WalletSwapAsset) => {
  const searchParams = new URLSearchParams({
    from: getWalletSwapAssetId(asset)
  })
  return `/swap?${searchParams.toString()}`
}
