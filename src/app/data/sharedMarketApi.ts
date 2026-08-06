import { BURRITO_MARKET_API_URL } from "../config/externalServices"

type SharedCandle = {
  time?: number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

type SharedCandleResponse = {
  base?: string
  quote?: string
  status?: "ok" | "limited" | "unavailable"
  candles?: SharedCandle[]
  limitations?: string[]
}

export type SharedPairCandle = {
  bucketStart: number
  open: number
  high: number
  low: number
  close: number
  volumeQuote: number
}

const activationRequested = new Set<string>()

export const requestSharedPairActivation = async (pairAddress: string) => {
  const normalized = pairAddress.trim().toLowerCase()
  if (!BURRITO_MARKET_API_URL || !normalized || activationRequested.has(normalized)) {
    return false
  }
  activationRequested.add(normalized)
  try {
    const response = await fetch(`${BURRITO_MARKET_API_URL}/v1/market/activate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ chain: "columbus-5", pair: normalized }),
      signal: AbortSignal.timeout(8_000)
    })
    return response.status === 202
  } catch {
    activationRequested.delete(normalized)
    return false
  }
}

const normalizeAssetId = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith("native:")) return normalized.slice("native:".length)
  if (normalized.startsWith("cw20:")) return normalized.slice("cw20:".length)
  return normalized
}

export const sharedIntervalForBucketMs = (bucketMs: number) => {
  const intervals = new Map<number, string>([
    [60_000, "1m"],
    [5 * 60_000, "5m"],
    [15 * 60_000, "15m"],
    [30 * 60_000, "30m"],
    [60 * 60_000, "1h"],
    [2 * 60 * 60_000, "2h"],
    [4 * 60 * 60_000, "4h"],
    [24 * 60 * 60_000, "1d"]
  ])
  return intervals.get(bucketMs)
}

export const normalizeSharedCandles = ({
  payload,
  leftAssetKey,
  rightAssetKey
}: {
  payload: SharedCandleResponse
  leftAssetKey: string
  rightAssetKey: string
}): SharedPairCandle[] => {
  if (!Array.isArray(payload.candles)) return []
  const left = normalizeAssetId(leftAssetKey)
  const right = normalizeAssetId(rightAssetKey)
  const base = normalizeAssetId(payload.base ?? "")
  const quote = normalizeAssetId(payload.quote ?? "")
  const direct = base === left && quote === right
  const reverse = base === right && quote === left
  if (!direct && !reverse) return []

  return payload.candles
    .map((candle) => {
      const bucketStart = Number(candle.time) * 1000
      const open = Number(candle.open)
      const high = Number(candle.high)
      const low = Number(candle.low)
      const close = Number(candle.close)
      const volumeQuote = Number(candle.volume ?? 0)
      if (
        !Number.isFinite(bucketStart) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0
      ) return null

      if (direct) {
        return { bucketStart, open, high, low, close, volumeQuote }
      }

      return {
        bucketStart,
        open: 1 / open,
        high: 1 / low,
        low: 1 / high,
        close: 1 / close,
        // The API stores quote volume in its native orientation. It cannot be
        // relabelled honestly after inversion without the matching base volume.
        volumeQuote: 0
      }
    })
    .filter((candle): candle is SharedPairCandle => candle !== null)
    .sort((a, b) => a.bucketStart - b.bucketStart)
}

export const fetchSharedPairCandles = async ({
  pairAddress,
  leftAssetKey,
  rightAssetKey,
  bucketMs,
  maxCandles
}: {
  pairAddress: string
  leftAssetKey: string
  rightAssetKey: string
  bucketMs: number
  maxCandles: number
}) => {
  const interval = sharedIntervalForBucketMs(bucketMs)
  if (!BURRITO_MARKET_API_URL || !interval) return []

  const params = new URLSearchParams({
    chain: "columbus-5",
    pair: pairAddress,
    interval,
    limit: String(Math.max(1, Math.min(5000, maxCandles))),
    order: "asc"
  })

  try {
    const response = await fetch(`${BURRITO_MARKET_API_URL}/v1/market/candles?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000)
    })
    if (!response.ok) return []
    const payload = (await response.json()) as SharedCandleResponse
    if (payload.status === "unavailable") {
      if (payload.limitations?.includes("candles_not_indexed")) {
        void requestSharedPairActivation(pairAddress)
      }
      return []
    }
    return normalizeSharedCandles({ payload, leftAssetKey, rightAssetKey })
  } catch {
    return []
  }
}
