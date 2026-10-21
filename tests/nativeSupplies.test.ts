import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { fetchEndpoint } = vi.hoisted(() => ({ fetchEndpoint: vi.fn() }))
vi.mock("../src/app/data/endpointFallback", () => ({
  fetchWithEndpointFallback: fetchEndpoint
}))

const entry = (denom: string, decimals = 6) => ({ denom, decimals })
const response = (amount = "12000000") => ({
  ok: true,
  json: async () => ({ amount: { amount } })
})

beforeEach(() => {
  vi.resetModules()
  fetchEndpoint.mockReset()
  fetchEndpoint.mockImplementation(async () => response())
})
afterEach(() => vi.restoreAllMocks())

describe("Market native supply reads", () => {
  it("keeps the original chain for every worker after a mid-batch chain switch", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    const { setActiveAppChainKey } = await import("../src/app/activeChain")
    setActiveAppChainKey("lunc")
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    fetchEndpoint.mockImplementation(async () => {
      await gate
      return response()
    })
    const pending = fetchNativeSupplies(Array.from({ length: 7 }, (_, i) => entry(`ucoin${i}`)))
    await vi.waitFor(() => expect(fetchEndpoint).toHaveBeenCalledTimes(6))
    setActiveAppChainKey("luna")
    release()
    const result = await pending
    expect(Object.keys(result)).toHaveLength(7)
    expect(fetchEndpoint).toHaveBeenCalledTimes(7)
    expect(fetchEndpoint.mock.calls.map(([url]) => new URL(url).hostname))
      .toEqual(Array(7).fill("terra-classic-lcd.publicnode.com"))
  })

  it("reuses fresh raw supply when the visible asset set changes", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    await fetchNativeSupplies([entry("uluna"), entry("uusd")])
    const result = await fetchNativeSupplies([entry("uusd", 3)])
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
    expect(result.uusd).toEqual({ denom: "uusd", amount: "12000000", units: 12000, decimals: 3 })
  })

  it("shares an overlapping pending read but converts each consumer's precision independently", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    fetchEndpoint.mockImplementation(async () => {
      await gate
      return response()
    })
    const first = fetchNativeSupplies([entry("uluna", 6)])
    const second = fetchNativeSupplies([entry("uluna", 3)])
    await Promise.resolve()
    release()
    const [a, b] = await Promise.all([first, second])
    expect(fetchEndpoint).toHaveBeenCalledTimes(1)
    expect(a.uluna.units).toBe(12)
    expect(b.uluna.units).toBe(12000)
  })

  it("isolates both cached and pending supply by chain ID and LCD endpoint", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    const scopes = [
      { chainId: "classic", lcd: "https://classic.test" },
      { chainId: "terra", lcd: "https://classic.test" },
      { chainId: "classic", lcd: "https://other.test" }
    ]
    let count = 0
    fetchEndpoint.mockImplementation(async () => response(String(++count)))
    const first = await Promise.all(scopes.map((scope) => fetchNativeSupplies([entry("uluna", 0)], scope)))
    const cached = await Promise.all(scopes.map((scope) => fetchNativeSupplies([entry("uluna", 0)], scope)))
    expect(fetchEndpoint).toHaveBeenCalledTimes(3)
    expect(first.map((result) => result.uluna.amount)).toEqual(["1", "2", "3"])
    expect(cached).toEqual(first)
  })

  it("refreshes after ten minutes instead of retaining stale supply forever", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    await fetchNativeSupplies([entry("uluna")])
    now.mockReturnValue(600999)
    await fetchNativeSupplies([entry("uluna")])
    expect(fetchEndpoint).toHaveBeenCalledTimes(1)
    now.mockReturnValue(601000)
    fetchEndpoint.mockImplementation(async () => response("3000000"))
    expect((await fetchNativeSupplies([entry("uluna")])).uluna.units).toBe(3)
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
  })

  it("bounds the cache even when many distinct assets are visited", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    for (let i = 0; i < 257; i++) await fetchNativeSupplies([entry(`ucoin${i}`)])
    await fetchNativeSupplies([entry("ucoin256")])
    expect(fetchEndpoint).toHaveBeenCalledTimes(257)
    await fetchNativeSupplies([entry("ucoin0")])
    expect(fetchEndpoint).toHaveBeenCalledTimes(258)
  })

  it("keeps successful siblings while failed assets remain retryable", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    fetchEndpoint.mockImplementation(async (url: string) => {
      if (new URL(url).searchParams.get("denom") === "ufail") return { ok: false }
      return response()
    })
    const first = await fetchNativeSupplies([entry("uluna"), entry("ufail")])
    expect(Object.keys(first)).toEqual(["uluna"])
    fetchEndpoint.mockImplementation(async () => response("0"))
    const retried = await fetchNativeSupplies([entry("uluna"), entry("ufail")])
    expect(retried.uluna.units).toBe(12)
    expect(retried.ufail.units).toBe(0)
    expect(fetchEndpoint).toHaveBeenCalledTimes(3)
  })

  it.each([
    null, {}, { amount: {} }, { amount: { amount: "" } },
    { amount: { amount: "-1" } }, { amount: { amount: "1.5" } },
    { amount: { amount: 12 } }, { amount: { amount: "9".repeat(400) } },
    { amount: { denom: "wrong-denom", amount: "12" } }
  ])("does not cache a malformed supply payload as zero: %j", async (payload) => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    fetchEndpoint.mockImplementationOnce(async () => ({ ok: true, json: async () => payload }))
    expect(await fetchNativeSupplies([entry("uluna")])).toEqual({})
    expect((await fetchNativeSupplies([entry("uluna")])).uluna.units).toBe(12)
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
  })

  it("releases failed JSON reads for retry", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    fetchEndpoint.mockImplementationOnce(async () => ({
      ok: true, json: async () => { throw new Error("invalid JSON") }
    }))
    expect(await fetchNativeSupplies([entry("uluna")])).toEqual({})
    expect((await fetchNativeSupplies([entry("uluna")])).uluna.units).toBe(12)
  })

  it("preserves case-sensitive factory denoms, deduplicates entries and caps workers at six", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    let active = 0
    let maximum = 0
    fetchEndpoint.mockImplementation(async () => {
      active++
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active--
      return response()
    })
    const denom = "factory/terra1issuer/MixedCase"
    const entries = [entry(denom), entry(denom), entry(""),
      ...Array.from({ length: 19 }, (_, i) => entry(`ucoin${i}`))]
    const result = await fetchNativeSupplies(entries)
    expect(Object.keys(result)).toHaveLength(20)
    expect(maximum).toBe(6)
    expect(fetchEndpoint).toHaveBeenCalledTimes(20)
    expect(new URL(fetchEndpoint.mock.calls[0][0]).searchParams.get("denom")).toBe(denom)
  })

  it("returns no synthetic value for invalid display precision", async () => {
    const { fetchNativeSupplies } = await import("../src/app/data/nativeSupplies")
    for (const decimals of [-1, 1.5, NaN, Infinity, 400]) {
      expect(await fetchNativeSupplies([entry("uluna", decimals)])).toEqual({})
    }
    expect((await fetchNativeSupplies([entry("uluna")])).uluna.units).toBe(12)
  })
})
