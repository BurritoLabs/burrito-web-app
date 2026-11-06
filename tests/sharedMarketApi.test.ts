import { afterEach, describe, expect, it, vi } from "vitest"
import {
  normalizeSharedCandles,
  fetchSharedPairCandles,
  requestSharedPairActivation,
  sharedIntervalForBucketMs
} from "../src/app/data/sharedMarketApi"

afterEach(() => vi.unstubAllGlobals())

describe("shared market candle API", () => {
  it("requests the newest limited window then orders it chronologically for the chart", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "ok", base: "uluna", quote: "uusd",
      candles: [
        { time: 1_700_001_800, open: 2, high: 4, low: 1, close: 3, volume: 8 },
        { time: 1_700_000_000, open: 1, high: 3, low: 0.5, close: 2, volume: 4 }
      ]
    })))
    vi.stubGlobal("fetch", fetchMock)
    const candles = await fetchSharedPairCandles({
      chainId: "columbus-5", pairAddress: "terra1latest-window",
      leftAssetKey: "uluna", rightAssetKey: "uusd",
      bucketMs: 30 * 60_000, maxCandles: 48
    })
    const query = new URL(fetchMock.mock.calls[0][0]).searchParams
    expect(query.get("order")).toBe("desc")
    expect(query.get("limit")).toBe("48")
    expect(query.get("interval")).toBe("30m")
    expect(candles.map((candle) => candle.bucketStart)).toEqual([1_700_000_000_000, 1_700_001_800_000])
    expect(candles[1].close).toBe(3)
  })
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
    })).toEqual([{ bucketStart: 1_700_000_000_000, open: 0.5, high: 1, low: 0.25, close: 0.4, volumeQuote: 0, volumeKnown: false }])
  })

  it("keeps observed prices when volume is missing without claiming zero trading activity", () => {
    const candles = normalizeSharedCandles({ payload: {
      base: "uluna", quote: "uusd",
      candles: [{ time: 1_700_000_000, open: 1, high: 3, low: 0.5, close: 2 }]
    }, leftAssetKey: "uluna", rightAssetKey: "uusd" })
    expect(candles[0]).toMatchObject({ close: 2, volumeKnown: false })
  })
})

describe("shared market activation", () => {
  it("deduplicates activation requests by exact chain and pair", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ status: "accepted" }), { status: 202 })
    }) as typeof fetch
    try {
      const pair = "terra1activation000000000000000000000000000000"
      expect(await requestSharedPairActivation("columbus-5", pair)).toBe(true)
      expect(await requestSharedPairActivation("columbus-5", pair)).toBe(false)
      expect(await requestSharedPairActivation("phoenix-1", pair)).toBe(true)
      expect(calls).toBe(2)
      const bodies = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => JSON.parse(String(call[1]?.body)) as { chain: string }
      )
      expect(bodies.map((body) => body.chain)).toEqual(["columbus-5", "phoenix-1"])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
