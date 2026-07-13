import type { AppChainKey } from "../../app/appChains"
import { CLASSIC_DENOMS } from "../../app/chain"
import {
  buildClassicNativeIconCandidates,
  buildIbcAssetIconCandidates
} from "../../app/utils/assetIcons"

export const getCommissionSymbol = (
  denom: string,
  chainKey: AppChainKey
) => {
  if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
    return chainKey === "luna" ? "LUNA" : CLASSIC_DENOMS.lunc.coinDenom
  }
  if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
    return CLASSIC_DENOMS.ustc.coinDenom
  }
  if (denom.startsWith("u")) {
    const base = denom.slice(1)
    if (base.length === 3) {
      return chainKey === "lunc"
        ? `${base.slice(0, 2).toUpperCase()}TC`
        : base.toUpperCase()
    }
    return base.toUpperCase()
  }
  if (denom.startsWith("ibc/")) {
    return `IBC/${denom.slice(4, 8).toUpperCase()}`
  }
  return denom.toUpperCase()
}

export const buildCommissionIconCandidates = (
  denom: string,
  chainKey: AppChainKey
) => {
  if (denom.startsWith("ibc/")) {
    return buildIbcAssetIconCandidates([], "/system/ibc.svg")
  }

  return buildClassicNativeIconCandidates({
    denom,
    symbol: getCommissionSymbol(denom, chainKey),
    fallback: "/system/cw20.svg"
  })
}
