const isFiniteUsd = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0

export const calculatePoolLiquidityUsd = ({
  bondingLiquidityUsd,
  leftValue,
  rightValue
}: {
  bondingLiquidityUsd?: number
  leftValue?: number
  pool?: unknown
  rightValue?: number
}) => {
  if (isFiniteUsd(bondingLiquidityUsd)) return bondingLiquidityUsd

  if (isFiniteUsd(leftValue) && isFiniteUsd(rightValue)) {
    return leftValue + rightValue
  }
  if (isFiniteUsd(leftValue)) return leftValue * 2
  if (isFiniteUsd(rightValue)) return rightValue * 2
  return undefined
}
