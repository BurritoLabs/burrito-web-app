import type { Cw20SupplyInfo } from "../data/cw20"

const isPrecision = (value: number) => Number.isInteger(value) && value >= 0 && value <= 255

// A reserve graph price has a known normalization basis, which is not proof of
// the token's actual decimals. Rebase only reserve-derived prices after strict
// token_info validation. Never apply this to an externally quoted spot price.
export const resolveCw20ReservePrice = (
  priceUsd: number | undefined,
  pricingDecimals: number,
  supply: Cw20SupplyInfo | undefined
): number | undefined => {
  if (!supply || priceUsd === undefined || !Number.isFinite(priceUsd) || priceUsd < 0 ||
    !isPrecision(pricingDecimals) || !isPrecision(supply.decimals)) return undefined
  const price = priceUsd * 10 ** (supply.decimals - pricingDecimals)
  return Number.isFinite(price) && price >= 0 && !(priceUsd > 0 && price === 0) ? price : undefined
}

export const resolveCw20ReserveValuation = (
  priceUsd: number | undefined,
  pricingDecimals: number,
  supply: Cw20SupplyInfo | undefined
): number | undefined => {
  const price = resolveCw20ReservePrice(priceUsd, pricingDecimals, supply)
  if (price === undefined || !supply) return undefined
  const value = price * supply.units
  return Number.isFinite(value) && value >= 0 && !(price > 0 && supply.units > 0 && value === 0)
    ? value : undefined
}

export const hasMarketCw20Precision = (
  contracts: readonly string[],
  supplies: Record<string, Cw20SupplyInfo>
) => contracts.every((contract) => supplies[contract] !== undefined)
