const DEFAULT_CHAIN_MARKET_CAP_MULTIPLIER = 10

export const guardChainRelativeValuation = (
  value: number | undefined,
  chainMarketCapUsd: number | undefined,
  multiplier = DEFAULT_CHAIN_MARKET_CAP_MULTIPLIER
) => {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined
  if (
    chainMarketCapUsd !== undefined &&
    Number.isFinite(chainMarketCapUsd) &&
    chainMarketCapUsd > 0 &&
    value > chainMarketCapUsd * multiplier
  ) {
    return undefined
  }
  return value
}
