import { BURRITO_MARKET_API_URL } from "../config/externalServices"
import type { DashboardRange } from "../dashboard/dashboardFormat"
import type { DashboardHistoryPoint } from "./dashboardHistory"

const METRIC_TIMEOUT_MS = 8_000
const METRIC_API_URL =
  import.meta.env.DEV && !import.meta.env.VITE_BURRITO_MARKET_API_URL
    ? "/burrito-api"
    : BURRITO_MARKET_API_URL

export type LunaDashboardMetric = "total_staked" | "unbonding" | "delegators"

type MetricSeriesResponse = {
  status?: "ok" | "limited" | "unavailable"
  points?: Array<{ timestamp?: number; value?: number | string }>
  latestValue?: number | string | null
  limitations?: string[]
}

export type DashboardMetricSeries = {
  status: "ok" | "limited" | "unavailable"
  points: DashboardHistoryPoint[]
  latestValue?: number
  limitations: string[]
}

export const normalizeDashboardMetricSeries = (
  response: MetricSeriesResponse,
  divisor = 1
): DashboardMetricSeries => {
  const safeDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : 1
  const points = (response.points ?? [])
    .map((point) => ({
      time: Number(point.timestamp) * 1_000,
      value: Number(point.value) / safeDivisor
    }))
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.value) &&
        point.time > 0 &&
        point.value >= 0
    )
    .sort((a, b) => a.time - b.time)
  const latest = Number(response.latestValue)

  return {
    status: response.status ?? (points.length ? "limited" : "unavailable"),
    points,
    latestValue: Number.isFinite(latest) ? latest / safeDivisor : undefined,
    limitations: Array.isArray(response.limitations) ? response.limitations : []
  }
}

export const fetchLunaDashboardMetric = async (
  metric: LunaDashboardMetric,
  range: DashboardRange
): Promise<DashboardMetricSeries> => {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), METRIC_TIMEOUT_MS)
  const params = new URLSearchParams({ chain: "luna", metric, range })

  try {
    const response = await fetch(
      `${METRIC_API_URL}/v1/metrics/series?${params}`,
      {
        headers: { accept: "application/json" },
        signal: controller.signal
      }
    )
    if (!response.ok) {
      throw new Error(`Dashboard metric request failed: ${response.status}`)
    }
    const payload = (await response.json()) as MetricSeriesResponse
    return normalizeDashboardMetricSeries(
      payload,
      metric === "delegators" ? 1 : 1_000_000
    )
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}
