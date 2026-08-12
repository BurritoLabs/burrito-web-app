import {
  BINANCE_MARKET_API_URL,
  COINPAPRIKA_LUNA_URL,
  COINPAPRIKA_LUNC_URL,
  COINPAPRIKA_USTC_URL
} from "../config/externalServices"

const HISTORY_TIMEOUT_MS = 8_000

export type DashboardHistoryPoint = {
  time: number
  value: number
}

type CoinPaprikaHistoricalPoint = {
  timestamp?: string
  price?: number
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  ...unknown[]
]

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`Dashboard history request failed: ${response.status}`)
    }
    return response.json() as Promise<T>
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

const tickerHistoryUrl = (tickerUrl: string, rangeMs: number) => {
  const start = new Date(Date.now() - rangeMs)
  start.setUTCHours(0, 0, 0, 0)
  return `${tickerUrl}/historical?start=${start.toISOString().slice(0, 10)}&interval=1d`
}

const BINANCE_SYMBOLS = {
  luna: "LUNAUSDT",
  lunc: "LUNCUSDT",
  ustc: "USTCUSDT"
} as const

export const normalizeBinanceHourlyPrices = (
  data: BinanceKline[] | undefined
): DashboardHistoryPoint[] =>
  (data ?? [])
    .map((point) => ({
      time: Number(point[0]),
      value: Number(point[4])
    }))
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.value) &&
        point.time > 0 &&
        point.value > 0
    )
    .sort((a, b) => a.time - b.time)

const fetchDashboardHourlyPriceHistory = async (
  asset: "luna" | "lunc" | "ustc"
) => {
  const params = new URLSearchParams({
    symbol: BINANCE_SYMBOLS[asset],
    interval: "1h",
    limit: "25"
  })
  const data = await fetchJson<BinanceKline[]>(
    `${BINANCE_MARKET_API_URL}/api/v3/klines?${params}`
  )
  return normalizeBinanceHourlyPrices(data)
}

export const fetchDashboardPriceHistory = async (
  asset: "luna" | "lunc" | "ustc",
  rangeMs: number,
  currentPrice?: number
): Promise<DashboardHistoryPoint[]> => {
  if (rangeMs <= 24 * 60 * 60 * 1000) {
    return fetchDashboardHourlyPriceHistory(asset)
  }

  const tickerUrl =
    asset === "luna"
      ? COINPAPRIKA_LUNA_URL
      : asset === "lunc"
        ? COINPAPRIKA_LUNC_URL
        : COINPAPRIKA_USTC_URL
  const data = await fetchJson<CoinPaprikaHistoricalPoint[]>(
    tickerHistoryUrl(tickerUrl, rangeMs)
  )
  const cutoff = Date.now() - rangeMs
  const points = (data ?? [])
    .map((point) => ({
      time: point.timestamp ? new Date(point.timestamp).getTime() : 0,
      value: Number(point.price)
    }))
    .filter((point) => point.time >= cutoff && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time)

  if (Number.isFinite(currentPrice)) {
    points.push({ time: Date.now(), value: Number(currentPrice) })
  }
  return points
}

export const calculateHistoryChange = (
  points: DashboardHistoryPoint[] | undefined
) => {
  if (!points || points.length < 2) return undefined
  const first = points[0]?.value
  const last = points.at(-1)?.value
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first) return undefined
  return ((Number(last) - Number(first)) / Number(first)) * 100
}
