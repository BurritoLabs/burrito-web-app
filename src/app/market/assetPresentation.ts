import type { Cw20Token } from "../data/terraAssets"
import { buildCw20IconCandidates } from "../utils/assetIcons"

type MarketDisplayAsset = {
  id: string
  symbol: string
  name: string
  decimals: number
  iconCandidates: string[]
}

export const hydrateMarketCw20Presentation = <T extends MarketDisplayAsset>(
  asset: T,
  tokens: Record<string, Cw20Token>
): T => {
  if (!asset.id.startsWith("cw20:")) return asset
  const token = tokens[asset.id.slice(5).toLowerCase()]
  if (!token) return asset
  const symbol = token.symbol || asset.symbol
  // Prices and reserve amounts were already normalized with asset.decimals.
  // Presentation hydration must not relabel those units without rebuilding
  // the price graph; otherwise the supply/price precision guard is bypassed.
  return {
    ...asset,
    symbol,
    name: token.name || symbol,
    iconCandidates: buildCw20IconCandidates(token.icon, symbol)
  }
}
