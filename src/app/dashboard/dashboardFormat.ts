import type { BinodesDashboardFrequency } from "../data/binodes"
import { formatNumber } from "../utils/format"
import { isLikelyMobileBrowser } from "../wallet/walletPlatform"

export type MetricLayout = "wide" | "tall"
export type MetricSize = "large"

export type MetricItem = {
  key: string
  label: string
  value: string
  unit?: string
  size?: MetricSize
  group?: string
  delta?: string
  deltaRaw?: number
  layout?: MetricLayout
}

export type DashboardRange = "24h" | "7d" | "30d" | "90d"

export const formatValue = (value?: number, decimals = 2) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return formatNumber(value, decimals)
}

export const formatDelta = (value?: number, decimals = 2, unit?: string) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const sign = value >= 0 ? "+" : ""
  const suffix = unit ? ` ${unit}` : ""
  return `${sign}${formatNumber(value, decimals)}${suffix}`
}

export const formatUsdSmart = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const decimals = abs < 0.01 ? 6 : abs < 1 ? 4 : 2
  return `$${formatNumber(value, decimals)}`
}

export const formatUsdStandard = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return `$${formatNumber(value, 2)}`
}

export const formatUsdCompact = (value?: number, signed = false) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const sign = signed && value > 0 ? "+" : ""
  return `${sign}$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value)}`
}

export const formatUtcHour = (value?: string) => {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  })
}

export const formatOracleDelta = (value?: number, unit?: string) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const decimals = abs < 1 ? 6 : abs < 100 ? 4 : 2
  return formatDelta(value, decimals, unit)
}

export const formatBlockInterval = (ms?: number) => {
  if (!ms || ms <= 0) return "--"
  return `${formatNumber(ms / 1000, 2)} s`
}

export const dashboardRanges: Record<
  DashboardRange,
  {
    label: string
    rangeMs: number
    ttlMs: number
    activityFrequency: BinodesDashboardFrequency
    activityBuckets: number
  }
> = {
  "24h": {
    label: "24H",
    rangeMs: 24 * 60 * 60 * 1000,
    ttlMs: 15 * 60 * 1000,
    activityFrequency: "HOUR",
    activityBuckets: 24
  },
  "7d": {
    label: "7D",
    rangeMs: 7 * 24 * 60 * 60 * 1000,
    ttlMs: 60 * 60 * 1000,
    activityFrequency: "DAY",
    activityBuckets: 7
  },
  "30d": {
    label: "30D",
    rangeMs: 30 * 24 * 60 * 60 * 1000,
    ttlMs: 2 * 60 * 60 * 1000,
    activityFrequency: "DAY",
    activityBuckets: 30
  },
  "90d": {
    label: "90D",
    rangeMs: 90 * 24 * 60 * 60 * 1000,
    ttlMs: 6 * 60 * 60 * 1000,
    activityFrequency: "DAY",
    activityBuckets: 90
  }
}

export const dashboardRangeOptions = Object.keys(
  dashboardRanges
) as DashboardRange[]

export const getIsMobileDashboard = () => {
  if (typeof window === "undefined") return false
  return isLikelyMobileBrowser() || window.innerWidth <= 640
}
