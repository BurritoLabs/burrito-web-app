import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/app/data/sharedMarketApi", () => ({ fetchSharedPairCandles: vi.fn(async () => []) }))
vi.mock("../src/app/data/binodes", () => ({ fetchBinodesDexTxDetails: vi.fn(async () => []) }))

const pair = `terra1${"q".repeat(38)}`
const options = { pairAddress: pair, leftAssetKey: "uluna", rightAssetKey: "uusd", leftDecimals: 6, rightDecimals: 6,
  bucketMs: 60_000, lookbackBuckets: 60, maxCandles: 60, maxPages: 1 }
const tick = (index: number) => ({
  timestamp: new Date(Math.floor(Date.now() / 60_000) * 60_000 - (index % 2 + 1) * 60_000).toISOString(), txhash: `TX${index}`,
  events: [{ type: "wasm", attributes: Object.entries({ _contract_address: pair, action: "swap", offer_asset: "uluna",
    ask_asset: "uusd", offer_amount: "1000000", return_amount: "2000000" }).map(([key, value]) => ({ key, value })) }]
})
const body = (count = 40, offset = 0) => ({ tx_responses: Array.from({ length: count }, (_, index) => tick(index + offset)) })
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }

beforeEach(() => { vi.resetModules(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe("market LCD page sharing", () => {
  it("coalesces simultaneous chart, 25-trade and 400-stat reads of one raw page", async () => {
    const { fetchPairCandles, fetchPairTrades } = await import("../src/app/data/market")
    const releases: Array<() => void> = []
    const fetchMock = vi.fn(async () => new Promise<Response>(resolve => { releases.push(() => resolve(Response.json(body()))) }))
    vi.stubGlobal("fetch", fetchMock)
    const results = [fetchPairCandles(options), fetchPairTrades({ ...options, limit: 25 }), fetchPairTrades({ ...options, limit: 400 })]
    await vi.dynamicImportSettled()
    await settle()
    const requestsBeforeRelease = fetchMock.mock.calls.length
    releases.forEach(release => release())
    const [candles, trades, stats] = await Promise.all(results)
    expect(candles).toHaveLength(2)
    expect(trades).toMatchObject({ trades: expect.any(Array), hasMore: true })
    expect("trades" in trades && trades.trades.length).toBe(25)
    expect("trades" in stats && stats.trades.length).toBe(40)
    expect(requestsBeforeRelease).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rereads the latest first page for deferred stats after new trades move page offsets", async () => {
    const { fetchPairCandles, fetchPairTrades } = await import("../src/app/data/market")
    let release!: (response: Response) => void
    let moved = false
    const snapshotBody = (count: number, offset: number) => ({ tx_responses: body(count, offset).tx_responses.map((row, index) => ({
      ...row, timestamp: new Date(Date.now() - (offset + index) * 1_000).toISOString()
    })) })
    const fetchMock = vi.fn(async (input: string | URL) => {
      const page = Number(new URL(input).searchParams.get("page"))
      if (!moved) return new Promise<Response>(resolve => { release = resolve })
      // A newly inserted TX0 moves old TX100 from the first page to the next.
      return Response.json(snapshotBody(page < 5 ? 100 : 2, (page - 1) * 100))
    })
    vi.stubGlobal("fetch", fetchMock)
    const initial = Promise.all([fetchPairCandles(options), fetchPairTrades({ ...options, limit: 25 })])
    await vi.dynamicImportSettled()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(Response.json(snapshotBody(100, 1)))
    await initial
    moved = true
    const stats = await fetchPairTrades({ ...options, limit: 400, maxPages: 5 })
    expect(stats.trades).toHaveLength(400)
    expect(stats.hasMore).toBe(true)
    expect(stats.trades.some(trade => trade.txhash === "TX0")).toBe(true)
    expect(new Set(stats.trades.map(trade => trade.txhash)).size).toBe(400)
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("page"))).toEqual(["1", "1", "2", "3", "4", "5"])
  })
})

describe("raw-page in-flight lifetime and cancellation", () => {
  const url = (page = 1, host = "lcd.fixture.invalid", query = "pair-swap") =>
    new URL(`https://${host}/cosmos/tx/v1beta1/txs?query=${query}&page=${page}&limit=100&order_by=2`)
  const controller = () => new AbortController()

  it("handles cancellation triggered synchronously before the subscriber listener is installed", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const caller = controller()
    let transport: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (_input: string, init: RequestInit) => {
      transport = init.signal as AbortSignal
      caller.abort()
      return new Promise<Response>(() => {})
    }))
    await expect(fetchMarketTxPage("columbus-5", url(), 3_500, caller.signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(transport?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("one cancelled consumer cannot abort a surviving consumer's transport", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const first = controller(), second = controller()
    let transport: AbortSignal | undefined
    let release!: (response: Response) => void
    const fetchMock = vi.fn(async (_input: string, init: RequestInit) => {
      transport = init.signal as AbortSignal
      return new Promise<Response>(resolve => { release = resolve })
    })
    vi.stubGlobal("fetch", fetchMock)
    const cancelled = fetchMarketTxPage("columbus-5", url(), 3_500, first.signal)
    const assertion = expect(cancelled).rejects.toMatchObject({ name: "AbortError" })
    const surviving = fetchMarketTxPage("columbus-5", url(), 3_500, second.signal)
    first.abort()
    await assertion
    expect(transport?.aborted).toBe(false)
    release(Response.json(body()))
    expect((await surviving).data?.tx_responses).toHaveLength(40)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("all cancellations abort underlying work, and late old work cannot poison a fresh retry", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const first = controller(), second = controller()
    const transports: AbortSignal[] = []
    const releases: Array<(response: Response) => void> = []
    const fetchMock = vi.fn(async (_input: string, init: RequestInit) => {
      transports.push(init.signal as AbortSignal)
      return new Promise<Response>(resolve => releases.push(resolve))
    })
    vi.stubGlobal("fetch", fetchMock)
    const a = fetchMarketTxPage("columbus-5", url(), 3_500, first.signal).catch(error => error.name)
    const b = fetchMarketTxPage("columbus-5", url(), 3_500, second.signal).catch(error => error.name)
    first.abort(); second.abort()
    expect(await Promise.all([a, b])).toEqual(["AbortError", "AbortError"])
    expect(transports[0].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    const retry = fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal)
    const joiningRetry = fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal)
    releases[0](Response.json(body(1)))
    releases[1](Response.json(body(2)))
    expect((await retry).data?.tx_responses).toHaveLength(2)
    expect((await joiningRetry).data?.tx_responses).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const next = fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal)
    releases[2](Response.json(body(3)))
    expect((await next).data?.tx_responses).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("one consumer's deadline cannot expire another consumer's active read", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const { withRequestDeadline } = await import("../src/app/data/requestDeadline")
    let transport: AbortSignal | undefined
    let release!: (response: Response) => void
    vi.stubGlobal("fetch", vi.fn(async (_input: string, init: RequestInit) => {
      transport = init.signal as AbortSignal
      return new Promise<Response>(resolve => { release = resolve })
    }))
    const expiring = withRequestDeadline(signal => fetchMarketTxPage("columbus-5", url(), 3_500, signal), { timeoutMs: 100 })
    const assertion = expect(expiring).rejects.toMatchObject({ name: "TimeoutError" })
    const surviving = withRequestDeadline(signal => fetchMarketTxPage("columbus-5", url(), 3_500, signal), { timeoutMs: 1_000 })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(transport?.aborted).toBe(false)
    release(Response.json(body()))
    expect((await surviving).data?.tx_responses).toHaveLength(40)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("never retains a completed page, including an immediately following read", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const fetchMock = vi.fn(async () => Response.json(body()))
    vi.stubGlobal("fetch", fetchMock)
    await fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal)
    await fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["http-error", "malformed", "throw"])("does not cache %s responses", async (failure) => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const fetchMock = vi.fn(async () => Response.json(body()))
    fetchMock.mockImplementationOnce(async () => {
      if (failure === "throw") throw new Error("offline")
      return failure === "http-error" ? new Response(null, { status: 503 }) : Response.json({ unexpected: [] })
    })
    vi.stubGlobal("fetch", fetchMock)
    await fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal).catch(() => undefined)
    expect((await fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal)).data?.tx_responses).toHaveLength(40)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("isolates chain, endpoint, query, page and timeout keys", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const releases: Array<(response: Response) => void> = []
    const fetchMock = vi.fn(async () => new Promise<Response>(resolve => releases.push(resolve)))
    vi.stubGlobal("fetch", fetchMock)
    const reads = [
      fetchMarketTxPage("columbus-5", url(), 3_500, controller().signal),
      fetchMarketTxPage("phoenix-1", url(), 3_500, controller().signal),
      fetchMarketTxPage("columbus-5", url(1, "other.fixture.invalid"), 3_500, controller().signal),
      fetchMarketTxPage("columbus-5", url(2), 3_500, controller().signal),
      fetchMarketTxPage("columbus-5", url(1, undefined, "pair-contract"), 3_500, controller().signal),
      fetchMarketTxPage("columbus-5", url(), 100, controller().signal)
    ]
    expect(fetchMock).toHaveBeenCalledTimes(6)
    releases.forEach(release => release(Response.json(body())))
    await Promise.all(reads)
  })

  it("frees completed slots so new pending keys can still coalesce", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const fetchMock = vi.fn(async () => Response.json(body()))
    vi.stubGlobal("fetch", fetchMock)
    for (let page = 1; page <= 24; page++) await fetchMarketTxPage("columbus-5", url(page), 3_500, controller().signal)
    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(async () => new Promise<Response>(resolve => { release = resolve }))
    const a = fetchMarketTxPage("columbus-5", url(25), 3_500, controller().signal)
    const b = fetchMarketTxPage("columbus-5", url(25), 3_500, controller().signal)
    expect(fetchMock).toHaveBeenCalledTimes(25)
    release(Response.json(body()))
    await Promise.all([a, b])
  })

  it("never evicts live subscribers when the 24-page in-flight map is saturated", async () => {
    const { fetchMarketTxPage } = await import("../src/app/data/marketTxPage")
    const transports: AbortSignal[] = []
    const fetchMock = vi.fn(async (_input: string, init: RequestInit) => {
      transports.push(init.signal as AbortSignal)
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal("fetch", fetchMock)
    const consumers = Array.from({ length: 26 }, controller)
    const reads = consumers.map((consumer, index) => fetchMarketTxPage("columbus-5", url(Math.min(index + 1, 25)), 3_500, consumer.signal).catch(error => error.name))
    expect(fetchMock).toHaveBeenCalledTimes(26)
    expect(transports.every(signal => !signal.aborted)).toBe(true)
    consumers.forEach(consumer => consumer.abort())
    await Promise.all(reads)
    expect(transports.every(signal => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
