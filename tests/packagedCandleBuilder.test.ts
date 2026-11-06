import { describe, expect, it } from "vitest"
import { buildObservedCandles } from "../scripts/lib/observed-candles.mjs"

const options = { bucketMs: 60_000, lookbackBuckets: 10, now: 650_000, maxCandles: 10 }
const tick = (timestamp: number, price = 2, volumeQuote = 5) => ({ timestamp, price, volumeQuote })

describe("scheduled packaged candle aggregation", () => {
  it("never invents bars before the first trade, between trades, or after the last trade", () => {
    const bars = buildObservedCandles({ ...options, ticks: [tick(181_000), tick(485_000, 3)] })
    expect(bars.map((bar: { bucketStart: number }) => bar.bucketStart)).toEqual([180_000, 480_000])
    expect(bars.every((bar: { tradeCount: number }) => bar.tradeCount === 1)).toBe(true)
  })

  it("keeps chronological real OHLC, counts and volume within observed buckets", () => {
    expect(buildObservedCandles({ ...options, ticks: [tick(200_000, 3, 4), tick(181_000, 2, 5), tick(210_000, 1, 6)] }))
      .toEqual([{ bucketStart: 180_000, open: 2, high: 3, low: 1, close: 1, volumeQuote: 15, tradeCount: 3 }])
  })

  it("has no bars for a quiet range and ignores stale/future/malformed observations", () => {
    expect(buildObservedCandles({ ...options, ticks: [tick(1), tick(660_000), tick(181_000, NaN), tick(181_000, 2, -1)] })).toEqual([])
    expect(buildObservedCandles({ ...options, ticks: [] })).toEqual([])
  })

  it("distinguishes an actual zero-volume observation from generated fill", () => {
    expect(buildObservedCandles({ ...options, ticks: [tick(181_000, 2, 0)] }))
      .toEqual([{ bucketStart: 180_000, open: 2, high: 2, low: 2, close: 2, volumeQuote: 0, tradeCount: 1 }])
  })

  it("retains the selected window boundary and limits most recent observed bars", () => {
    const bars = buildObservedCandles({ ...options, maxCandles: 2, ticks: [tick(60_000), tick(180_000), tick(600_000)] })
    expect(bars.map((bar: { bucketStart: number }) => bar.bucketStart)).toEqual([180_000, 600_000])
    expect(buildObservedCandles({ ...options, bucketMs: 0, ticks: [tick(180_000)] })).toEqual([])
  })
})
