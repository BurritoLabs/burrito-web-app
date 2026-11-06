import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchCurrentDashboardSnapshot, fetchCurrentPhoenixDashboardSnapshot } from "../src/app/data/dashboard"
import { setActiveAppChainKey } from "../src/app/activeChain"

const healthyData = (input: string) => {
  const url = new URL(input)
  if (url.pathname === "/v1/dashboard") return {
    issuances: { uluna: "100000000", uusd: "20000000" },
    communityPool: { uluna: "10000000", uusd: "2000000" },
    stakingPool: { bondedTokens: "30000000", stakingRatio: "0.3" }
  }
  if (url.pathname.endsWith("/supply/by_denom")) return { amount: { amount: url.searchParams.get("denom") === "uusd" ? "20000000" : "100000000" } }
  if (url.pathname.endsWith("/community_pool")) return { pool: [{ denom: "uluna", amount: "10000000" }, { denom: "uusd", amount: "2000000" }] }
  if (url.pathname.endsWith("/pool")) return { pool: { bonded_tokens: "30000000" } }
  if (url.pathname.endsWith("/params")) return { params: { max_validators: "130", unbonding_time: "1814400s" } }
  if (url.pathname.endsWith("/validators")) return { pagination: { total: "110" } }
  if (url.pathname.endsWith("/inflation")) return { inflation: "0.07" }
  if (url.pathname.endsWith("/blocks/latest")) return { block: { header: { height: "100", time: "2026-11-06T12:00:06Z" } } }
  if (url.pathname.endsWith("/blocks/99")) return { block: { header: { height: "99", time: "2026-11-06T12:00:00Z" } } }
  if (url.pathname.includes("/balances/")) return { balances: [{ denom: "uluna", amount: "4000000" }, { denom: "uusd", amount: "1000000" }] }
  throw new Error(`Unexpected request ${input}`)
}
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
const unavailable = () => new Response(null, { status: 503 })
const pending = () => new Promise<never>(() => {})

beforeEach(() => {
  vi.useFakeTimers()
  const storage = new Map<string, string>()
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  } })
  setActiveAppChainKey("lunc")
})
afterEach(() => {
  setActiveAppChainKey("lunc")
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("production Dashboard snapshot source resilience", () => {
  it("preserves complete source values and caches a healthy snapshot", async () => {
    const fetchMock = vi.fn(async (url: string) => json(healthyData(url)))
    vi.stubGlobal("fetch", fetchMock)
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot).toMatchObject({ coverage: "complete", sourceIssues: [], stale: false, luncSupply: 100, ustcSupply: 20, circulatingLunc: 60, circulatingUstc: 18, stakedLunc: 30, stakingRatio: 0.3, blockHeight: 100, blockTimeMs: 6000 })
    expect(snapshot.fetchedAt).toBe(snapshot.timestamp)
    const calls = fetchMock.mock.calls.length
    expect(await fetchCurrentDashboardSnapshot()).toEqual(snapshot)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("recovers FCD supply, staking and pools from LCD without losing other metrics", async () => {
    const fetchMock = vi.fn(async (url: string) => new URL(url).pathname === "/v1/dashboard" ? unavailable() : json(healthyData(url)))
    vi.stubGlobal("fetch", fetchMock)
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot).toMatchObject({ coverage: "partial", sourceIssues: ["fcd-dashboard"], luncSupply: 100, ustcSupply: 20, luncCommunity: 10, stakedLunc: 30, stakingRatio: 0.3, circulatingLunc: 60, blockHeight: 100 })
    const calls = fetchMock.mock.calls.length
    await fetchCurrentDashboardSnapshot()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not invent zero for unavailable financial sources or query a previous block after latest fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname
      return path.includes("/balances/") || path.endsWith("/blocks/latest") ? unavailable() : json(healthyData(url))
    })
    vi.stubGlobal("fetch", fetchMock)
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot.luncSupply).toBe(100)
    expect(snapshot.luncOracle).toBeUndefined()
    expect(snapshot.ustcBurned).toBeUndefined()
    expect(snapshot.blockHeight).toBeUndefined()
    expect(snapshot.blockTimeMs).toBeUndefined()
    expect(snapshot.sourceIssues).toEqual(["burn-address", "latest-block", "oracle-pool"])
    expect(fetchMock.mock.calls.every(([url]) => !/\/blocks\/\d/.test(url))).toBe(true)
  })

  it("rejects all-source failure and retries instead of caching zeros", async () => {
    const fetchMock = vi.fn(async () => unavailable())
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchCurrentDashboardSnapshot()).rejects.toThrow("Dashboard sources unavailable")
    const calls = fetchMock.mock.calls.length
    await expect(fetchCurrentDashboardSnapshot()).rejects.toThrow("Dashboard sources unavailable")
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("bounds stalled response bodies across fallback attempts and aborts their transports", async () => {
    const stalledSignals: AbortSignal[] = []
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (new URL(url).pathname === "/v1/dashboard") {
        stalledSignals.push(init.signal as AbortSignal)
        return { ok: true, status: 200, json: pending } as unknown as Response
      }
      return json(healthyData(url))
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchCurrentDashboardSnapshot()
    await vi.advanceTimersByTimeAsync(6000)
    expect(await result).toMatchObject({ coverage: "partial", luncSupply: 100, blockTimeMs: 6000 })
    expect(stalledSignals.length).toBeGreaterThan(0)
    expect(stalledSignals.every(signal => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("bounds a completely hung job, including headers and JSON", async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal)
      return pending()
    }))
    const result = fetchCurrentDashboardSnapshot()
    const assertion = expect(result).rejects.toThrow("Dashboard sources unavailable")
    await vi.advanceTimersByTimeAsync(6500)
    await assertion
    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps in-flight Classic fallbacks and caches isolated from a Phoenix chain switch", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (new URL(url).pathname === "/v1/dashboard") {
        await new Promise(resolve => setTimeout(resolve, 100))
        return unavailable()
      }
      const data = healthyData(url)
      if (url.includes("terra-lcd.publicnode.com") && url.includes("/supply/by_denom")) return json({ amount: { amount: "900000000" } })
      return json(data)
    })
    vi.stubGlobal("fetch", fetchMock)
    const classicRequest = fetchCurrentDashboardSnapshot()
    setActiveAppChainKey("luna")
    const phoenix = await fetchCurrentPhoenixDashboardSnapshot()
    await vi.advanceTimersByTimeAsync(200)
    expect((await classicRequest).luncSupply).toBe(100)
    expect(phoenix.luncSupply).toBe(900)
    expect(phoenix.ustcSupply).toBeUndefined()
    const calls = fetchMock.mock.calls.length
    expect((await fetchCurrentPhoenixDashboardSnapshot()).luncSupply).toBe(900)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("treats malformed successful payloads as unavailable rather than numerical zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new URL(url).pathname.endsWith("/validators") ? json({}) : json(healthyData(url))))
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot.activeValidators).toBeUndefined()
    expect(snapshot.coverage).toBe("partial")
    expect(snapshot.sourceIssues).toContain("active-validators")
    expect(snapshot.stakedLunc).toBe(30)
  })

  it.each([" ", "\t", " 0", "0 ", "01", "1e2", "0x10", "+1", "-1", null, false])("rejects a noncanonical scalar %j in an otherwise successful response", async (total) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new URL(url).pathname.endsWith("/validators") ? json({ pagination: { total } }) : json(healthyData(url))))
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot.activeValidators).toBeUndefined()
    expect(snapshot.sourceIssues).toContain("active-validators")
    expect(snapshot.luncSupply).toBe(100)
  })

  it.each([
    [{}], [null], [false], [[]], [{ amount: "0" }],
    [{ denom: " uluna", amount: "0" }], [{ denom: "uluna", amount: " " }],
    [{ denom: "uluna", amount: false }], [{ denom: "uluna" }],
    [{ denom: "uluna", amount: "1000000" }, { denom: "uluna", amount: "2000000" }]
  ])("rejects malformed oracle coin rows %j without fabricating zero", async (...rows) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/balances/terra1jgp") ? json({ balances: rows }) : json(healthyData(url))))
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot.luncOracle).toBeUndefined()
    expect(snapshot.ustcOracle).toBeUndefined()
    expect(snapshot.luncBurned).toBe(4)
    expect(snapshot.luncSupply).toBe(100)
    expect(snapshot.sourceIssues).toEqual(["oracle-pool"])
  })

  it("accepts a genuinely empty successful balance list as known zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/balances/terra1jgp") ? json({ balances: [] }) : json(healthyData(url))))
    expect(await fetchCurrentDashboardSnapshot()).toMatchObject({ luncOracle: 0, ustcOracle: 0, coverage: "complete" })
  })

  it.each([[], "bad", 1, false, null, { uluna: " " }])("recovers a malformed FCD pool %j through LCD", async (communityPool) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const data = healthyData(url)
      return json(new URL(url).pathname === "/v1/dashboard" ? { ...data, communityPool } : data)
    }))
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot).toMatchObject({ luncSupply: 100, luncCommunity: 10, stakedLunc: 30, coverage: "partial", sourceIssues: ["fcd-community-pool"] })
  })

  it("keeps supply when both the FCD pool and its LCD recovery are malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = new URL(url).pathname
      if (path === "/v1/dashboard") return json({ ...healthyData(url), communityPool: [] })
      if (path.endsWith("/community_pool")) return json({ pool: [{}] })
      return json(healthyData(url))
    }))
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot.luncSupply).toBe(100)
    expect(snapshot.luncCommunity).toBeUndefined()
    expect(snapshot.circulatingLunc).toBeUndefined()
    expect(snapshot.sourceIssues).toEqual(["community-pool", "fcd-community-pool"])
  })

  it("rejects fractional block heights and validator limits while recovering an invalid FCD ratio", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname
      if (path === "/v1/dashboard") return json({ ...healthyData(url), stakingPool: { bondedTokens: "30000000", stakingRatio: "1.1" } })
      if (path.endsWith("/blocks/latest")) return json({ block: { header: { height: "1.5", time: "2026-11-06T12:00:06Z" } } })
      if (path.endsWith("/params")) return json({ params: { max_validators: "130.5", unbonding_time: "1814400s" } })
      return json(healthyData(url))
    })
    vi.stubGlobal("fetch", fetchMock)
    const snapshot = await fetchCurrentDashboardSnapshot()
    expect(snapshot.stakingRatio).toBe(0.3)
    expect(snapshot.blockHeight).toBeUndefined()
    expect(snapshot.maxValidators).toBeUndefined()
    expect(fetchMock.mock.calls.every(([url]) => !/\/blocks\/\d/.test(url))).toBe(true)
  })
})
