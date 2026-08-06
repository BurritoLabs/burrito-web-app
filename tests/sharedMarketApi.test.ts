import { describe, expect, it, vi } from "vitest"
import {
  normalizeSharedCandles,
  requestSharedPairActivation,
  sharedIntervalForBucketMs
} from "../src/app/data/sharedMarketApi"

describe("shared market candle API", () => {
  it("maps chart buckets to the server interval contract", () => {
    expect(sharedIntervalForBucketMs(60_000)).toBe("1m")
    expect(sharedIntervalForBucketMs(30 * 60_000)).toBe("30m")
    expect(sharedIntervalForBucketMs(2 * 60 * 60_000)).toBe("2h")
  })

  it("normalizes direct candles from seconds to milliseconds", () => {
    expect(normalizeSharedCandles({
      payload: {
        base: "uluna",
        quote: "uusd",
        candles: [{ time: 1_700_000_000, open: 1, high: 3, low: 0.5, close: 2, volume: 4 }]
      },
      leftAssetKey: "native:uluna",
      rightAssetKey: "native:uusd"
    })).toEqual([{ bucketStart: 1_700_000_000_000, open: 1, high: 3, low: 0.5, close: 2, volumeQuote: 4 }])
  })

  it("inverts OHLC safely when the displayed asset order is reversed", () => {
    expect(normalizeSharedCandles({
      payload: {
        base: "uluna",
        quote: "uusd",
        candles: [{ time: 1_700_000_000, open: 2, high: 4, low: 1, close: 2.5, volume: 9 }]
      },
      leftAssetKey: "uusd",
      rightAssetKey: "uluna"
    })).toEqual([{ bucketStart: 1_700_000_000_000, open: 0.5, high: 1, low: 0.25, close: 0.4, volumeQuote: 0 }])
  })
})

describe("shared market activation", () => {
  it("deduplicates activation requests for one pair", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ status: "accepted" }), { status: 202 })
    }) as typeof fetch
    try {
      const pair = "terra1activation000000000000000000000000000000"
      expect(await requestSharedPairActivation(pair)).toBe(true)
      expect(await requestSharedPairActivation(pair)).toBe(false)
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
