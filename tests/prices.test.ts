import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchPrices } from "../src/app/data/classic"

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
})

describe("price provider fallbacks", () => {
  it("keeps CoinPaprika prices when CoinGecko is rate limited", async () => {
    const requestedUrls: string[] = []

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input.toString()
      requestedUrls.push(url)

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
})
