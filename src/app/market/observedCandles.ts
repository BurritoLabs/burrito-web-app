import type { PairCandle } from "../data/market"

// Keep only observed OHLC bars in the selected window. Empty periods must not
// become invented flat candles, including periods before the first trade.
export const selectObservedCandles = ({
  candles,
  bucketMs,
  lookbackBuckets,
  maxCandles,
  now = Date.now()
}: {
  candles: PairCandle[]
  bucketMs: number
  lookbackBuckets: number
  maxCandles: number
  now?: number
}) => {
  if (bucketMs <= 0 || lookbackBuckets <= 0 || maxCandles <= 0) return []
  const lastBucket = Math.floor(now / bucketMs) * bucketMs
  const firstBucket = lastBucket - bucketMs * (lookbackBuckets - 1)
  const unique = new Map<number, PairCandle>()
  for (const candle of candles) {
    if (
      !Number.isFinite(candle.bucketStart) ||
      candle.bucketStart < firstBucket || candle.bucketStart > lastBucket ||
      ![candle.open, candle.high, candle.low, candle.close].every(
        (value) => Number.isFinite(value) && value > 0
      ) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close) ||
      !Number.isFinite(candle.volumeQuote) || candle.volumeQuote < 0
    ) continue
    unique.set(candle.bucketStart, candle)
  }
  return Array.from(unique.values())
    .sort((left, right) => left.bucketStart - right.bucketStart)
    .slice(-maxCandles)
}
