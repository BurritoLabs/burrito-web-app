import type { Time } from "lightweight-charts"
import {
  formatNumber,
  formatNumberNoRoundByNonZeroFractionDigits
} from "../utils/format"

export type Timeframe = "1h" | "24h" | "7d"

export const TIMEFRAME_BUCKET_MS: Record<Timeframe, number> = {
  "1h": 60 * 1000,
  "24h": 30 * 60 * 1000,
  "7d": 2 * 60 * 60 * 1000
}

export const TIMEFRAME_LOOKBACK_BUCKETS: Record<Timeframe, number> = {
  "1h": 60,
  "24h": 48,
  "7d": 84
}

export const MIN_CANDLES_FOR_CHART: Record<Timeframe, number> = {
  "1h": 20,
  "24h": 12,
  "7d": 18
}

export const formatUsdNoRound = (value: number) => {
  return `$${formatNumberNoRoundByNonZeroFractionDigits(value, 4)}`
}

export const formatAxisPrice = (value: number) => {
  return formatNumberNoRoundByNonZeroFractionDigits(value, 6)
}

export const formatChartAxisPrice = (value: number) => {
  if (!Number.isFinite(value)) return String(value)

  const abs = Math.abs(value)
  if (abs >= 1_000) return formatNumber(value, 0)
  if (abs >= 1) return formatNumberNoRoundByNonZeroFractionDigits(value, 2, 8)
  if (abs >= 0.01) return formatNumberNoRoundByNonZeroFractionDigits(value, 3, 8)
  return formatNumberNoRoundByNonZeroFractionDigits(value, 2, 10)
}

export const formatChartAxisUsd = (value: number, quoteUsd?: number) => {
  if (quoteUsd === undefined) return formatChartAxisPrice(value)
  const usdValue = value * quoteUsd
  if (!Number.isFinite(usdValue)) return String(usdValue)

  const sign = usdValue < 0 ? "-" : ""
  const abs = Math.abs(usdValue)
  const body =
    abs >= 1_000
      ? formatNumber(abs, 0)
      : abs >= 1
        ? formatNumberNoRoundByNonZeroFractionDigits(abs, 2, 8)
        : abs >= 0.01
          ? formatNumberNoRoundByNonZeroFractionDigits(abs, 3, 8)
          : formatNumberNoRoundByNonZeroFractionDigits(abs, 2, 10)

  return `${sign}$${body}`
}

export const formatChartDetailUsd = (value: number) => {
  if (!Number.isFinite(value)) return String(value)
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  return `${sign}$${formatNumberNoRoundByNonZeroFractionDigits(abs, 4, 12)}`
}

export const formatChartUsdPerBase = (
  value: number,
  quoteUsd?: number,
  baseSymbol?: string
) => {
  if (quoteUsd === undefined) return "--"
  const formatted = formatChartDetailUsd(value * quoteUsd)
  if (!baseSymbol) return formatted
  return `≈ ${formatted} per ${baseSymbol}`
}

export const formatTradeTime = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp))

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
]

export const formatChartTime = (timestampMs: number, tf: Timeframe) =>
  new Intl.DateTimeFormat("en-US", {
    month: tf === "1h" ? undefined : "short",
    day: tf === "1h" ? undefined : "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestampMs))

export const formatChartTickTime = (
  timestampSeconds: number,
  tf: Timeframe,
  tickMarkType: number,
  tickMarkTypeEnum: {
    DayOfMonth: number
    Month: number
    Year: number
  }
) => {
  const date = new Date(timestampSeconds * 1000)
  if (Number.isNaN(date.getTime())) return ""

  const month = MONTH_SHORT[date.getMonth()] ?? ""
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  if (tf === "1h") return `${hours}:${minutes}`

  if (tf === "24h") {
    if (
      tickMarkType === tickMarkTypeEnum.DayOfMonth ||
      tickMarkType === tickMarkTypeEnum.Month ||
      tickMarkType === tickMarkTypeEnum.Year
    ) {
      return `${month} ${day}`
    }
    return `${hours}:${minutes}`
  }

  if (tickMarkType === tickMarkTypeEnum.Year) {
    return `${month} ${day}, ${date.getFullYear()}`
  }

  return `${month} ${day}`
}

export const resolveChartEventTime = (time: Time): number | null => {
  if (typeof time === "number") return time * 1000
  if (typeof time === "string") {
    const parsed = Date.parse(time)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parsed = Date.UTC(time.year, time.month - 1, time.day)
  return Number.isFinite(parsed) ? parsed : null
}

export const formatTradePrice = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  return formatNumberNoRoundByNonZeroFractionDigits(value, 5)
}

export const formatTradeAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  return formatNumberNoRoundByNonZeroFractionDigits(value, 4)
}
