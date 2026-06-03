import { TERRA_ADDRESS_PATTERN } from "./walletPanelUtils"
import { CLASSIC_DENOMS } from "../chain"

type WalletSwapAsset = {
  denom: string
  kind?: "cw20" | "native" | string
}

const normalizeWalletNativeDenom = (denom: string) =>
  denom.startsWith("ibc/") ? `ibc/${denom.slice(4).toUpperCase()}` : denom

export const getWalletSwapAssetId = (asset: WalletSwapAsset) => {
  const denom = asset.denom.trim()
  const isCw20 = asset.kind === "cw20" || TERRA_ADDRESS_PATTERN.test(denom)
  return isCw20
    ? `cw20:${denom.toLowerCase()}`
    : `native:${normalizeWalletNativeDenom(denom)}`
}

export const getWalletSwapCounterAssetId = (asset: WalletSwapAsset) => {
  const fromAssetId = getWalletSwapAssetId(asset)
  return fromAssetId === `native:${CLASSIC_DENOMS.lunc.coinMinimalDenom}`
    ? `native:${CLASSIC_DENOMS.ustc.coinMinimalDenom}`
    : `native:${CLASSIC_DENOMS.lunc.coinMinimalDenom}`
}

export const getWalletSwapPath = (asset: WalletSwapAsset) => {
  const searchParams = new URLSearchParams({
    from: getWalletSwapAssetId(asset),
    to: getWalletSwapCounterAssetId(asset)
  })
  return `/swap?${searchParams.toString()}`
}
