import { afterEach, describe, expect, it, vi } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import { fetchTxHistoryPage } from "../src/app/data/classic"

const txResponse = (txhash: string, height: string, timestamp: string) => ({
  txhash,
  height,
  timestamp,
  code: 0,
  logs: [],
  events: []
})

afterEach(() => {
  setActiveAppChainKey("lunc")
  vi.unstubAllGlobals()
})

describe("transaction history", () => {
  it("queries the Terra Classic LCD when LUNC is active", async () => {
    setActiveAppChainKey("lunc")
    const urls: URL[] = []

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      urls.push(new URL(input.toString()))
      return new Response(JSON.stringify({
        txs: [],
        tx_responses: [],
        pagination: { total: "0" }
      }), { status: 200 })
    }))

    await fetchTxHistoryPage("terra1history", 1, 50)

    expect(urls).toHaveLength(8)
    expect(urls.every((url) => url.origin === "https://terra-classic-lcd.publicnode.com")).toBe(true)
  })

  it("queries Phoenix transactions newest-first and deduplicates event results", async () => {
    setActiveAppChainKey("luna")
    const urls: URL[] = []

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString())
      urls.push(url)
      const query = url.searchParams.get("query") ?? ""
      const txResponses = query.startsWith("message.sender=")
        ? [
            txResponse("LATEST", "200", "2026-07-13T12:00:00Z"),
            txResponse("OLDER", "100", "2026-07-12T12:00:00Z")
          ]
        : query.startsWith("transfer.recipient=")
          ? [
              txResponse("LATEST", "200", "2026-07-13T12:00:00Z"),
              txResponse("RECEIVED", "150", "2026-07-12T18:00:00Z")
            ]
          : []

      return new Response(JSON.stringify({
        txs: txResponses.map(() => ({ body: { messages: [] } })),
        tx_responses: txResponses,
        pagination: { total: String(txResponses.length) }
      }), { status: 200 })
    }))

    const result = await fetchTxHistoryPage("terra1history", 1, 50)

    expect(result.items.map((item) => item.txhash)).toEqual([
      "LATEST",
      "RECEIVED",
      "OLDER"
    ])
    expect(result.hasMore).toBe(false)
    expect(urls).toHaveLength(8)
    expect(urls.every((url) => url.origin.includes("terra"))).toBe(true)
    expect(urls.every((url) => url.searchParams.get("order_by") === "ORDER_BY_DESC")).toBe(true)
    expect(urls.every((url) => url.searchParams.get("page") === "1")).toBe(true)
    expect(urls.every((url) => url.searchParams.get("limit") === "50")).toBe(true)
  })

  it("reports another page only when an event stream has more results", async () => {
    setActiveAppChainKey("luna")
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString())
      const query = url.searchParams.get("query") ?? ""
      const total = query.startsWith("message.sender=") ? "51" : "0"
      return new Response(JSON.stringify({
        txs: [],
        tx_responses: [],
        total
      }), { status: 200 })
    }))

    const firstPage = await fetchTxHistoryPage("terra1history", 1, 50)
    const secondPage = await fetchTxHistoryPage("terra1history", 2, 50)

    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.hasMore).toBe(false)
  })
})
