import { useMemo } from "react"
import { CLASSIC_DENOMS } from "../chain"
import type { WalletAssetRow } from "./useWalletAssets"
import { toUnitAmount } from "../utils/format"

const ALWAYS_VISIBLE_DENOMS: Set<string> = new Set([
  CLASSIC_DENOMS.lunc.coinMinimalDenom,
  CLASSIC_DENOMS.ustc.coinMinimalDenom
])

const LOW_BALANCE_USD_THRESHOLD = 1
const LOW_BALANCE_AMOUNT_THRESHOLD = 0.01

const passesLowBalanceFilter = (asset: WalletAssetRow) => {
  if (ALWAYS_VISIBLE_DENOMS.has(asset.denom)) {
    return true
  }

  if (asset.value !== undefined) {
    return asset.value >= LOW_BALANCE_USD_THRESHOLD
  }

  if (asset.kind === "cw20") {
    return false
  }

  return toUnitAmount(asset.amount, asset.decimals) >= LOW_BALANCE_AMOUNT_THRESHOLD
}

type UseWalletAssetVisibilityOptions = {
  assetRows: WalletAssetRow[]
  hiddenKeys?: Iterable<string>
  hideLowBalance?: boolean
  hideUnknownAssets?: boolean
}

export const useWalletAssetVisibility = ({
  assetRows,
  hiddenKeys,
  hideLowBalance = false,
  hideUnknownAssets = false
}: UseWalletAssetVisibilityOptions) =>
  useMemo(() => {
    const hiddenSet =
      hiddenKeys instanceof Set ? hiddenKeys : new Set(hiddenKeys ?? [])

    const visibleAssetRows = assetRows.filter((asset) => {
      if (hiddenSet.has(asset.denom)) return false
      if (hideUnknownAssets && !asset.whitelisted) return false
      if (hideLowBalance && !passesLowBalanceFilter(asset)) return false
      return true
    })

    return {
      visibleAssetRows,
      visibleCoinRows: visibleAssetRows.filter(
        (asset) => asset.kind === "native" && !asset.denom.startsWith("ibc/")
      ),
      visibleTokenRows: visibleAssetRows.filter(
        (asset) => asset.kind === "cw20" || asset.kind === "ibc"
      )
    }
  }, [assetRows, hiddenKeys, hideLowBalance, hideUnknownAssets])
