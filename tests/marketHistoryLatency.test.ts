import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchPairCandles, fetchPairTrades } from "../src/app/data/market"
import { fetchSharedPairCandles } from "../src/app/data/sharedMarketApi"
import { setActiveAppChainKey } from "../src/app/activeChain"

vi.mock("../src/app/data/sharedMarketApi", () => ({ fetchSharedPairCandles: vi.fn() }))

const pair = `terra1${"q".repeat(38)}`
const options = {
  pairAddress: pair, leftAssetKey: "uluna", rightAssetKey: "uusd",
  leftDecimals: 6, rightDecimals: 6, bucketMs: 60_000,
  lookbackBuckets: 60, maxCandles: 60, maxPages: 6, minCandles: 20
}
const swap = (timestamp: number, txhash: string, pairAddress = pair) => ({
  timestamp: new Date(timestamp).toISOString(), txhash,
  events: [{ type: "wasm", attributes: Object.entries({
    _contract_address: pairAddress, action: "swap", offer_asset: "uluna",
    ask_asset: "uusd", offer_amount: "1000000", return_amount: "2000000"
  }).map(([key, value]) => ({ key, value })) }]
})

afterEach(() => {
  setActiveAppChainKey("lunc")
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("bounded market history", () => {
  it("does not report an empty history when every source failed", async () => {
    vi.mocked(fetchSharedPairCandles).mockResolvedValueOnce([])
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })))
    await expect(fetchPairCandles(options)).rejects.toThrow("sources are unavailable")
    await expect(fetchPairTrades(options)).rejects.toThrow("sources are unavailable")
  })

  it("does not discard a usable fallback because a chain bar is outside the visible window", async () => {
    vi.useFakeTimers()
    const now = Date.parse("2026-10-19T12:00:00Z")
    vi.setSystemTime(now)
    const testPair = `terra1${"p".repeat(38)}`
    vi.mocked(fetchSharedPairCandles).mockResolvedValueOnce([])
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input)
      return new Response(JSON.stringify(url.startsWith("/market/candles/")
        ? { candles: { "1h": { "uluna|uusd": [{ bucketStart: now - 60_000,
          open: 2, high: 2, low: 2, close: 2, volumeQuote: 10 }] } } }
        : { data: [], tx_responses: [swap(now - 60 * 60_000, "BOUNDARY", testPair)] }))
    }))
    const result = await fetchPairCandles({ ...options, pairAddress: testPair, includeLocalFallback: true })
    expect(result).toHaveLength(1)
    expect(result[0].bucketStart).toBe(now - 60_000)
  })

  it("keeps a request on its captured chain even if the app chain changes while awaiting data", async () => {
    const testPair = `terra1${"z".repeat(38)}`
    const bucketStart = Math.floor(Date.now() / 60_000) * 60_000 - 60_000
    vi.mocked(fetchSharedPairCandles).mockImplementationOnce(async () => {
      setActiveAppChainKey("luna")
      return []
    })
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => new Response(JSON.stringify(
      String(input).startsWith("/market/candles/")
        ? { candles: { "1h": { "uluna|uusd": [{ bucketStart, open: 2, high: 2, low: 2, close: 2, volumeQuote: 10 }] } } }
        : { tx_responses: [], data: [] }
    ))))
    const result = await fetchPairCandles({ ...options, pairAddress: testPair, includeLocalFallback: true })
    expect(result).toHaveLength(1)
    expect(result[0].bucketStart).toBe(bucketStart)
  })

  it("returns sparse chain candles without scanning the same history again", async () => {
    vi.mocked(fetchSharedPairCandles).mockResolvedValueOnce([])
    const now = Math.floor(Date.now() / 60_000) * 60_000
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify(
      String(url).includes("/cosmos/tx/")
        ? { tx_responses: [swap(now - 60_000, "NEW"), swap(now - 180_000, "OLD")] }
        : { data: [] }
    )))
    vi.stubGlobal("fetch", fetchMock)
    const candles = await fetchPairCandles(options)
    expect(candles.map((bar) => bar.bucketStart)).toEqual([now - 180_000, now - 60_000])
    expect(candles.map((bar) => bar.close)).toEqual([2, 2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("ends a hanging source within the 12-second chart budget with a retryable error", async () => {
    vi.useFakeTimers()
    vi.mocked(fetchSharedPairCandles).mockImplementationOnce(() => new Promise(() => {}))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    let error: Error | undefined
    void fetchPairCandles(options).catch((cause) => { error = cause })
    await vi.advanceTimersByTimeAsync(12_001)
    expect(error?.name).toBe("TimeoutError")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cancels an obsolete chart and does not start fallback requests", async () => {
    const controller = new AbortController()
    let sourceSignal: AbortSignal | undefined
    vi.mocked(fetchSharedPairCandles).mockImplementationOnce(async (input) => {
      sourceSignal = input.signal
      return new Promise(() => {})
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    let error: Error | undefined
    void fetchPairCandles({ ...options, signal: controller.signal }).catch((cause) => { error = cause })
    await vi.waitFor(() => expect(vi.mocked(fetchSharedPairCandles)).toHaveBeenCalled())
    controller.abort()
    await vi.waitFor(() => expect(error?.name).toBe("AbortError"))
    expect(sourceSignal?.aborted).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("bounds header-success/body-hang requests and aborts transport on cancellation", async () => {
    vi.useFakeTimers()
    vi.mocked(fetchSharedPairCandles).mockResolvedValueOnce([])
    const signals: AbortSignal[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      signals.push(init!.signal!)
      return { ok: true, status: 200, json: () => new Promise(() => {}) } as Response
    }))
    let error: Error | undefined
    void fetchPairCandles(options).catch((cause) => { error = cause })
    await vi.advanceTimersByTimeAsync(12_001)
    expect(error?.name).toBe("TimeoutError")
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    const requests = signals.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(signals).toHaveLength(requests)
  })

  it("does not reuse quote volume after reversing packaged candles", async () => {
    vi.mocked(fetchSharedPairCandles).mockResolvedValueOnce([])
    const bucketStart = Math.floor(Date.now() / 60_000) * 60_000 - 60_000
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => new Response(JSON.stringify(
      String(url).startsWith("/market/candles/") ? { candles: { "1h": { "uusd|uluna": [
        { bucketStart, open: 0.5, high: 0.5, low: 0.5, close: 0.5, volumeQuote: 77 }
      ] } } } : { tx_responses: [], data: [] }
    ))))
    const candles = await fetchPairCandles({ ...options, includeLocalFallback: true })
    expect(candles).toEqual([{ bucketStart, open: 2, high: 2, low: 2, close: 2,
      volumeQuote: 0, volumeKnown: false }])
  })

  it("stops a cancelled trade request before starting chain fallback", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
    }))
    vi.stubGlobal("fetch", fetchMock)
    let error: Error | undefined
    void fetchPairTrades({ ...options, signal: controller.signal }).catch((cause) => { error = cause })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    await vi.waitFor(() => expect(error?.name).toBe("AbortError"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
