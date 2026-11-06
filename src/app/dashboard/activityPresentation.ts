import type { BinodesDashboardActivity, BinodesDashboardSeriesPoint } from "../data/binodes"
import type { DashboardHistoryPoint } from "../data/dashboardHistory"

export const dashboardActivityPoints = (
  series: BinodesDashboardSeriesPoint[],
  field: "transferAmountUsd" | "activeAddressCount"
): DashboardHistoryPoint[] => series.flatMap(point => {
  const time = new Date(point.dt).getTime()
  const value = point[field]
  return Number.isFinite(time) && value !== undefined && Number.isFinite(value)
    ? [{ time, value }] : []
})

export const dashboardActivityTotal = (points: DashboardHistoryPoint[]) =>
  points.length ? points.reduce((sum, point) => sum + point.value, 0) : undefined

export const dashboardBurnAmount = (burns: BinodesDashboardActivity["luncBurns"]) => {
  const fee = burns?.fee_burn_amt_actual
  const voluntary = burns?.voluntary_burn_amt_actual
  return fee !== undefined && voluntary !== undefined && Number.isFinite(fee) && Number.isFinite(voluntary)
    ? fee + voluntary : undefined
}

export const dashboardBurnPoints = (series: BinodesDashboardSeriesPoint[]) => series.flatMap(point => {
  const time = new Date(point.dt).getTime()
  const value = point.luncBurnUsd
  const secondaryValue = point.ustcBurnUsd
  return Number.isFinite(time) && value !== undefined && secondaryValue !== undefined &&
    Number.isFinite(value) && Number.isFinite(secondaryValue)
    ? [{ time, value, secondaryValue }] : []
})

export const dashboardFeeYieldPoints = (
  series: BinodesDashboardSeriesPoint[],
  stakedAmount: number | undefined,
  price: number | undefined,
  annualizationFactor: number
): DashboardHistoryPoint[] => {
  if (stakedAmount === undefined || price === undefined || !Number.isFinite(stakedAmount) ||
      !Number.isFinite(price) || stakedAmount <= 0 || price <= 0) return []
  const stakedValue = stakedAmount * price
  return series.flatMap(point => {
    const time = new Date(point.dt).getTime()
    const fee = point.feeGasUsd
    if (!Number.isFinite(time) || fee === undefined || !Number.isFinite(fee) || fee < 0) return []
    const value = fee * annualizationFactor * 100 / stakedValue
    return Number.isFinite(value) ? [{ time, value }] : []
  })
}
