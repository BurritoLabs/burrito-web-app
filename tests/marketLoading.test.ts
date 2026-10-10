import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchPackagedMarketSnapshot, fetchPairCandles } from "../src/app/data/market"
import { fetchSharedPairCandles } from "../src/app/data/sharedMarketApi"
import { selectObservedCandles } from "../src/app/market/observedCandles"

vi.mock("../src/app/data/sharedMarketApi", () => ({ fetchSharedPairCandles: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("market bootstrap", () => {
  it("reads the bundled Classic snapshot without waiting for any remote API", async () => {
    const pair = `terra1${"q".repeat(38)}`
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      chainId: "columbus-5",
      generatedAt: "2026-10-01T00:00:00Z",
      pairs: [{ pair, dexId: "terraswap", poolAssets: [
        { id: "native:uluna", amount: "1000000" },
        { id: "native:uusd", amount: "2000000" }
      ] }]
    })))
    vi.stubGlobal("fetch", fetchMock)
    const snapshot = await fetchPackagedMarketSnapshot("columbus-5")
    expect(snapshot?.pairs[0].pair).toBe(pair)
    expect(snapshot?.pools[0].poolAssets[1].amount).toBe("2000000")
    expect(snapshot?.pools[0].snapshotSource).toBe("packaged")
    expect(snapshot?.generatedAt).toBe("2026-10-01T00:00:00Z")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/market/index.json")
  })

  it("never displays a Classic snapshot on Phoenix", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPackagedMarketSnapshot("phoenix-1")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a wrong-chain snapshot and handles an unavailable packaged file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ chainId: "phoenix-1" }))))
    expect(await fetchPackagedMarketSnapshot("columbus-5")).toBeNull()
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    expect(await fetchPackagedMarketSnapshot("columbus-5")).toBeNull()
  })

  it.each([false, true])("preserves snapshot provenance after the pools query resolves (shared=%s)", async (sharedAvailable) => {
    vi.resetModules()
    const { fetchMarketPools } = await import("../src/app/data/market")
    const pair = `terra1${"q".repeat(38)}`
    const generatedAt = new Date().toISOString()
    const payload = { chainId: "columbus-5", generatedAt, pairs: [
      { pair, dexId: "terraswap", snapshotSource: "shared", snapshotGeneratedAt: generatedAt, poolAssets: [
        { id: "native:uluna", amount: "1000000" },
        { id: "native:uusd", amount: "2000000" }
      ] }
    ] }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/v1/market/index") && !sharedAvailable) return new Response("not found", { status: 404 })
      return new Response(JSON.stringify(payload))
    })
    vi.stubGlobal("fetch", fetchMock)
    const pools = await fetchMarketPools([{ pair, dexId: "terraswap", dexLabel: "Terraswap", type: "xyk", assets: ["uluna", "uusd"] }])
    expect(pools[0].snapshotSource).toBe(sharedAvailable ? "shared" : "packaged")
    expect(pools[0].snapshotGeneratedAt).toBe(generatedAt)
    expect(fetchMock).toHaveBeenCalledTimes(sharedAvailable ? 1 : 2)
    // Resolving again from the module cache cannot turn packaged data into live data.
    expect((await fetchMarketPools([{ pair, dexId: "terraswap", dexLabel: "Terraswap", type: "xyk", assets: ["uluna", "uusd"] }]))[0].snapshotSource).toBe(pools[0].snapshotSource)
  })

  it("does not label the whole shared catalogue live or substitute its publication date", async () => {
    vi.resetModules()
    const { fetchMarketPools } = await import("../src/app/data/market")
    const sources = ["shared", "packaged", "shared", "shared"]
    const dates = [new Date().toISOString(), null, new Date(Date.now() - 600_000).toISOString(), null]
    const pairs = ["q", "p", "z", "r"].map((letter) => ({
      pair: `terra1${letter.repeat(38)}`, dexId: "terraswap", dexLabel: "Terraswap", type: "xyk",
      assets: ["uluna", "uusd"] as [string, string]
    }))
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      chainId: "columbus-5", generatedAt: new Date().toISOString(),
      pairs: pairs.map((pair, index) => ({ ...pair,
        snapshotSource: sources[index], snapshotGeneratedAt: dates[index],
        poolAssets: [{ id: "native:uluna", amount: "1000" }, { id: "native:uusd", amount: "2000" }]
      }))
    }))))
    const pools = await fetchMarketPools(pairs)
    expect(pools.map((pool) => pool.snapshotSource)).toEqual(["shared", "packaged", "packaged", "packaged"])
    expect(pools[1].snapshotGeneratedAt).toBeUndefined()
    expect(pools[2].snapshotGeneratedAt).toBe(dates[2])
    expect(pools[3].snapshotGeneratedAt).toBeUndefined()
  })
})

describe("observed market candles", () => {
  const bar = (bucketStart: number) => ({ bucketStart, open: 2, high: 3, low: 1, close: 2.5, volumeQuote: 10 })
  const options = { bucketMs: 60_000, lookbackBuckets: 10, maxCandles: 10, now: 600_000 }

  it("preserves real OHLC and gaps instead of manufacturing zero-volume candles", () => {
    const candles = [bar(480_000), bar(180_000)]
    expect(selectObservedCandles({ ...options, candles })).toEqual([candles[1], candles[0]])
  })

  it("excludes stale/future/invalid bars and deduplicates timestamps", () => {
    expect(selectObservedCandles({ ...options, candles: [
      bar(0), bar(660_000), bar(480_000), bar(480_000),
      { ...bar(180_000), high: 1 }, { ...bar(240_000), volumeQuote: NaN }
    ] })).toEqual([bar(480_000)])
  })

  it("shows sparse shared candles immediately without starting chain history crawls", async () => {
    const nowBucket = Math.floor(Date.now() / 60_000) * 60_000
    const candles = [bar(nowBucket - 180_000), bar(nowBucket - 60_000)]
    vi.mocked(fetchSharedPairCandles).mockResolvedValueOnce(candles)
    const fetchMock = vi.fn(async () => { throw new Error("Unexpected fallback request") })
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPairCandles({
      pairAddress: `terra1${"q".repeat(38)}`, leftAssetKey: "uluna", rightAssetKey: "uusd",
      leftDecimals: 6, rightDecimals: 6, bucketMs: 60_000,
      lookbackBuckets: 60, maxCandles: 60, minCandles: 20
    })).toEqual(candles)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
