import { BURRITO_MARKET_API_URL } from "../config/externalServices"
import type { DashboardRange } from "../dashboard/dashboardFormat"
import type { DashboardHistoryPoint } from "./dashboardHistory"
import { withRequestDeadline } from "./requestDeadline"

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
  const metricNumber = (value: unknown) => {
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
  }
  const safeDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : 1
  const points = (response.points ?? [])
    .map((point) => ({
      time: Number(point.timestamp) * 1_000,
      value: metricNumber(point.value) === undefined ? NaN : Number(point.value) / safeDivisor
    }))
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.value) &&
        point.time > 0 &&
        point.value >= 0
    )
    .sort((a, b) => a.time - b.time)
  const latest = metricNumber(response.latestValue)

  return {
    status: response.status ?? (points.length ? "limited" : "unavailable"),
    points,
    latestValue: latest === undefined ? undefined : latest / safeDivisor,
    limitations: Array.isArray(response.limitations) ? response.limitations : []
  }
}

export const fetchLunaDashboardMetric = async (
  metric: LunaDashboardMetric,
  range: DashboardRange,
  signal?: AbortSignal
): Promise<DashboardMetricSeries> => {
  const params = new URLSearchParams({ chain: "luna", metric, range })

  return withRequestDeadline(async requestSignal => {
    const response = await fetch(
      `${METRIC_API_URL}/v1/metrics/series?${params}`,
      {
        headers: { accept: "application/json" },
        signal: requestSignal
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
  }, { signal, timeoutMs: METRIC_TIMEOUT_MS })
}
