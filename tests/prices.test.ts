import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchPrices, getCachedPrices } from "../src/app/data/classic"
import { refreshPrices } from "../src/app/data/prices"

const serviceConfig = vi.hoisted(() => ({ url: "https://prices.test" }))
vi.mock("../src/app/config/externalServices", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/app/config/externalServices")>(),
  get BURRITO_REGISTRY_API_URL() { return serviceConfig.url }
}))

const validPrices = { luna: { usd: 0.16 }, lunc: { usd: 0.00005 }, ustc: { usd: 0.005 } }
const cacheKey = "burritoPriceCache"
let storage: Map<string, string>
const json = (value: unknown) => new Response(JSON.stringify(value))
const cache = (value: unknown) => storage.set(cacheKey, JSON.stringify(value))

beforeEach(() => {
  serviceConfig.url = "https://prices.test"
  storage = new Map()
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  } })
})

const paprikaTicker = (price: number, marketCap: number) => ({
  quotes: {
    USD: {
      price,
      market_cap: marketCap,
      percent_change_1h: 1,
      percent_change_24h: 2,
      percent_change_7d: 3
    }
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("price provider fallbacks", () => {
  it("retains the backend as-of time and retries a stale snapshot instead of renewing it", async () => {
    const asOf = Date.now() - 120_000
    const snapshot = { ...validPrices, _meta: { asOf, stale: true } }
    const fetchMock = vi.fn(async () => json(snapshot))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPrices()).toEqual(snapshot)
    expect(getCachedPrices()).toEqual({ ts: asOf, data: snapshot })
    expect(JSON.parse(storage.get(cacheKey)!).ts).toBe(asOf)
    await fetchPrices()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(storage.get(cacheKey)!).ts).toBe(asOf)
  })

  it.each([
    { asOf: Date.now() - 600_000, stale: true },
    { asOf: Date.now() + 60_000, stale: false },
    { asOf: "today", stale: true },
    { asOf: Date.now(), stale: "false" }
  ])("does not present invalid or expired server snapshots as fresh: %j", async (_meta) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/v1/finder/prices")
      ? json({ ...validPrices, _meta }) : new Response("unavailable", { status: 503 })))
    await expect(fetchPrices()).rejects.toThrow("Current prices are unavailable")
    expect(storage.has(cacheKey)).toBe(false)
  })

  it("an explicit refresh bypasses a valid cache but still deduplicates concurrent retries", async () => {
    cache({ ts: Date.now() - 1_000, data: validPrices })
    const fetchMock = vi.fn(async () => json({ ...validPrices, luna: { usd: 0.25 } }))
    vi.stubGlobal("fetch", fetchMock)
    const first = refreshPrices()
    expect(refreshPrices()).toBe(first)
    expect((await first).luna?.usd).toBe(0.25)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps CoinPaprika prices when CoinGecko is rate limited", async () => {
    const requestedUrls: string[] = []

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input.toString()
      requestedUrls.push(url)

      if (url.includes("/v1/finder/prices")) return new Response("unavailable", { status: 503 })

      if (url.includes("/luna-terra-v2")) {
        return new Response(JSON.stringify(paprikaTicker(0.16, 115_000_000)))
      }
      if (url.includes("/luna-terra")) {
        return new Response(JSON.stringify(paprikaTicker(0.00005, 275_000_000)))
      }
      if (url.includes("/ust-terrausd")) {
        return new Response(JSON.stringify(paprikaTicker(0.005, 30_000_000)))
      }
      if (url.includes("/simple/price")) {
        return new Response("rate limited", { status: 429 })
      }

      throw new Error(`Unexpected price request: ${url}`)
    }))

    const prices = await fetchPrices()

    expect(prices).toEqual({
      luna: {
        usd: 0.16,
        usd_market_cap: 115_000_000,
        usd_1h_change: 1,
        usd_24h_change: 2,
        usd_7d_change: 3
      },
      lunc: {
        usd: 0.00005,
        usd_market_cap: 275_000_000,
        usd_1h_change: 1,
        usd_24h_change: 2,
        usd_7d_change: 3
      },
      ustc: {
        usd: 0.005,
        usd_market_cap: 30_000_000,
        usd_1h_change: 1,
        usd_24h_change: 2,
        usd_7d_change: 3
      }
    })
    expect(requestedUrls.some((url) => url.includes("/simple/price"))).toBe(true)
    expect(requestedUrls.some((url) => url.includes("/coins/markets"))).toBe(false)
  })

  it("uses a valid shared-service response without requesting public providers", async () => {
    const fetchMock = vi.fn(async () => json(validPrices))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPrices()).toEqual(validPrices)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://prices.test/v1/finder/prices")
    expect(getCachedPrices()?.data).toEqual(validPrices)
  })

  it("uses the existing local Burrito proxy when no service override is configured", async () => {
    serviceConfig.url = ""
    const fetchMock = vi.fn(async () => json(validPrices))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPrices()).toEqual(validPrices)
    expect(fetchMock.mock.calls[0][0]).toBe("/burrito-api/v1/finder/prices")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("returns a complete fresh cache without network requests", async () => {
    cache({ ts: Date.now() - 1000, data: validPrices })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPrices()).toEqual(validPrices)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { data: validPrices },
    { ts: "now", data: validPrices },
    { ts: Date.now() + 60_000, data: validPrices },
    { ts: Date.now() - 300_000, data: validPrices },
    { ts: Date.now(), data: { luna: validPrices.luna } },
    { ts: Date.now(), data: { ...validPrices, lunc: { usd: "0.1" } } },
    { ts: Date.now(), data: { ...validPrices, lunc: { usd: -1 } } },
    { ts: Date.now(), data: { ...validPrices, lunc: { usd: null } } }
  ])("does not reuse an invalid, partial, future or expired cache: %j", async (value) => {
    cache(value)
    expect(getCachedPrices()).toBeUndefined()
    const fetchMock = vi.fn(async () => json(validPrices))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPrices()).toEqual(validPrices)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("continues when browser storage access throws", async () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Storage disabled") } })
    vi.stubGlobal("fetch", vi.fn(async () => json(validPrices)))
    expect(getCachedPrices()).toBeUndefined()
    expect(await fetchPrices()).toEqual(validPrices)
  })

  it("ignores corrupted cache JSON", async () => {
    storage.set(cacheKey, "not json")
    vi.stubGlobal("fetch", vi.fn(async () => json(validPrices)))
    expect(getCachedPrices()).toBeUndefined()
    expect(await fetchPrices()).toEqual(validPrices)
  })

  it("completes a partial shared response without overwriting its fresh price", async () => {
    const requested: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      requested.push(input)
      if (input.includes("/v1/finder/prices")) return json({ luna: { usd: 0.2 } })
      if (input.includes("/simple/price")) return json({ "terra-luna": { usd: 0.00006 }, terrausd: { usd: 0.006 } })
      return new Response("unavailable", { status: 503 })
    }))
    expect(await fetchPrices()).toEqual({ luna: { usd: 0.2 }, lunc: { usd: 0.00006 }, ustc: { usd: 0.006 } })
    expect(requested.some((url) => url.includes("luna-terra-v2"))).toBe(false)
    expect(requested.some((url) => url.includes("/coins/markets"))).toBe(false)
  })

  it("rejects malformed/zero/negative prices and invalid optional fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input.includes("/v1/finder/prices")) return json({ luna: { usd: "2" }, lunc: { usd: -1 }, ustc: { usd: 0 } })
      if (input.includes("/coins/markets")) return json([
        { id: "terra-luna-2", current_price: 0.16, market_cap: -1, price_change_percentage_24h: "bad" },
        { id: "terra-luna", current_price: 0.00005 },
        { id: "terraclassicusd", current_price: 0.005 }
      ])
      return json(null)
    }))
    expect(await fetchPrices()).toEqual(validPrices)
  })

  it("does not restamp or return expired cached prices when every provider fails", async () => {
    cache({ ts: Date.now() - 600_000, data: validPrices })
    const before = storage.get(cacheKey)
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })))
    await expect(fetchPrices()).rejects.toThrow("Current prices are unavailable")
    expect(storage.get(cacheKey)).toBe(before)
  })

  it("does not mix an expired asset into a partial fresh result", async () => {
    cache({ ts: Date.now() - 600_000, data: validPrices })
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("/v1/finder/prices")
      ? json({ luna: { usd: 0.2 } }) : new Response("unavailable", { status: 503 })))
    expect(await fetchPrices()).toEqual({ luna: { usd: 0.2 } })
    expect(JSON.parse(storage.get(cacheKey)!).data).toEqual({ luna: { usd: 0.2 } })
    expect(getCachedPrices()).toBeUndefined()
  })

  it("deduplicates concurrent cross-chain consumers and releases a failed request", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    const first = fetchPrices()
    const second = fetchPrices()
    expect(second).toBe(first)
    await expect(first).rejects.toThrow("Current prices are unavailable")
    expect(fetchMock).toHaveBeenCalledTimes(6)
    fetchMock.mockImplementation(async () => json(validPrices))
    expect(await fetchPrices()).toEqual(validPrices)
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it("bounds a stalled response body and falls back after five seconds", async () => {
    vi.useFakeTimers()
    let primarySignal: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      if (input.includes("/v1/finder/prices")) {
        primarySignal = init.signal as AbortSignal
        return { ok: true, json: () => new Promise((_resolve, reject) => {
          primarySignal!.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })
        }) }
      }
      if (input.includes("/simple/price")) return json({ "terra-luna-2": validPrices.luna, "terra-luna": validPrices.lunc, terraclassicusd: validPrices.ustc })
      return new Response("unavailable", { status: 503 })
    }))
    const prices = fetchPrices()
    await vi.advanceTimersByTimeAsync(5000)
    expect(primarySignal?.aborted).toBe(true)
    expect(await prices).toEqual(validPrices)
    expect(vi.getTimerCount()).toBe(0)
  })
})
