import type { MarketPoolSnapshot } from "../data/market"

const isFiniteUsd = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0

export const isWesoWrappedBackingPool = (
  pool: Pick<MarketPoolSnapshot, "dexId" | "pair" | "poolAssets" | "type">
) =>
  pool.dexId === "weso-defi" &&
  pool.type === "weso-pool" &&
  pool.poolAssets.some(
    (asset) =>
      asset.id.startsWith("cw20:") &&
      asset.id.slice("cw20:".length).toLowerCase() === pool.pair
  )

export const calculatePoolLiquidityUsd = ({
  bondingLiquidityUsd,
  leftValue,
  pool,
  rightValue
}: {
  bondingLiquidityUsd?: number
  leftValue?: number
  pool: Pick<MarketPoolSnapshot, "dexId" | "pair" | "poolAssets" | "type">
  rightValue?: number
}) => {
  if (isFiniteUsd(bondingLiquidityUsd)) return bondingLiquidityUsd

  if (isWesoWrappedBackingPool(pool)) {
    const values = [leftValue, rightValue].filter(isFiniteUsd)
    if (values.length === 0) return undefined
    return Math.min(...values)
  }

  if (isFiniteUsd(leftValue) && isFiniteUsd(rightValue)) {
    return leftValue + rightValue
  }
  if (isFiniteUsd(leftValue)) return leftValue * 2
  if (isFiniteUsd(rightValue)) return rightValue * 2
  return undefined
}
