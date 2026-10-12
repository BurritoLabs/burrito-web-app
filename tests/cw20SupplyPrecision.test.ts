import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchCw20Supplies, getCw20SupplyUnitsForDecimals } from "../src/app/data/cw20"

const { fetchEndpoint } = vi.hoisted(() => ({ fetchEndpoint: vi.fn() }))
vi.mock("../src/app/data/endpointFallback", () => ({
  fetchWithEndpointFallback: fetchEndpoint
}))

const scope = { chainId: "supply-precision-test", lcd: "https://lcd.test" }
const token = "terra1testtoken"
const whitelist = { [token]: { token, symbol: "TEST", decimals: 6 } }
const response = (total_supply: unknown = "12000000", decimals: unknown = 6) => ({
  ok: true, json: async () => ({ data: { total_supply, decimals } })
})
const values = new Map<string, string>()
const storage = {
  get length() { return values.size },
  key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
  removeItem: (key: string) => { values.delete(key) }
}
const read = () => fetchCw20Supplies([token], whitelist, scope)
const savedEntry = () => {
  const key = [...values.keys()].find((item) => item.startsWith("cw20supply-token:v2:"))
  expect(key).toBeDefined()
  return { key: key!, payload: JSON.parse(values.get(key!)!) }
}

beforeEach(() => {
  values.clear()
  vi.stubGlobal("window", { localStorage: storage })
  fetchEndpoint.mockReset()
  fetchEndpoint.mockImplementation(async () => response())
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("CW20 supply precision and cache provenance", () => {
  it("does not combine verified supply units with a differently normalized price", () => {
    const supply = { totalSupply: "1200000000", decimals: 8, units: 12 }
    expect(getCw20SupplyUnitsForDecimals(supply, 6)).toBeUndefined()
    expect(getCw20SupplyUnitsForDecimals(supply, 8)).toBe(12)
    expect(getCw20SupplyUnitsForDecimals(supply, NaN)).toBeUndefined()
    expect(getCw20SupplyUnitsForDecimals(undefined, 8)).toBeUndefined()
  })

  it("preserves zero supply and zero price when precision matches", () => {
    const supply = { totalSupply: "0", decimals: 0, units: 0 }
    expect(getCw20SupplyUnitsForDecimals(supply, 0)).toBe(0)
    expect(getCw20SupplyUnitsForDecimals({ ...supply, totalSupply: "12", units: 12 }, 0)! * 0).toBe(0)
  })

  it("does not guess decimals from a registry when token_info omits them", async () => {
    fetchEndpoint.mockImplementationOnce(async () => ({
      ok: true, json: async () => ({ data: { total_supply: "12000000" } })
    }))
    expect(await read()).toEqual({})
    expect(values.size).toBe(0)
    expect((await read())[token].units).toBe(12)
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
  })

  it.each([null, "6", -1, 1.5, 256, NaN, Infinity, {}, true])(
    "rejects invalid on-chain precision without caching it: %j", async (decimals) => {
      fetchEndpoint.mockImplementationOnce(async () => response("12000000", decimals))
      expect(await read()).toEqual({})
      expect(values.size).toBe(0)
      expect((await read())[token].units).toBe(12)
    }
  )

  it.each(["", "-1", "1.5", "1e6", "0x10", " 42 ", 42, null, "invalid",
    "340282366920938463463374607431768211456", "9".repeat(400)])(
    "does not turn a malformed Uint128 supply into a value or zero: %j", async (amount) => {
      fetchEndpoint.mockImplementationOnce(async () => response(amount))
      expect(await read()).toEqual({})
      expect(values.size).toBe(0)
      expect((await read())[token].units).toBe(12)
    }
  )

  it.each([0, 6, 8, 18, 255])("uses explicit u8 decimals %i rather than the registry", async (decimals) => {
    fetchEndpoint.mockImplementationOnce(async () => response("12000000", decimals))
    expect((await read())[token]).toEqual({ totalSupply: "12000000", decimals, units: 12000000 / 10 ** decimals })
  })

  it("preserves a genuine zero and the Uint128 maximum", async () => {
    fetchEndpoint.mockImplementationOnce(async () => response("0", 0))
    expect((await read())[token]).toEqual({ totalSupply: "0", decimals: 0, units: 0 })
    const maximum = "340282366920938463463374607431768211455"
    fetchEndpoint.mockImplementationOnce(async () => response(maximum, 18))
    expect((await fetchCw20Supplies(["other"], {}, scope)).other)
      .toEqual({ totalSupply: maximum, decimals: 18, units: Number(maximum) / 1e18 })
  })

  it("ignores both old cache formats whose decimals may have been inferred", async () => {
    const inferred = { totalSupply: "999999", decimals: 6, units: 999999 }
    values.set(`cw20supply-token:v1:${scope.chainId}:${token}`, JSON.stringify({ ts: Date.now(), data: inferred }))
    values.set(`cw20supply:${scope.chainId}:${token}`, JSON.stringify({
      ts: Date.now(), data: { [token]: JSON.stringify(inferred) }
    }))
    values.set("wallet-fixture", "preserve")
    expect((await read())[token].units).toBe(12)
    expect(fetchEndpoint).toHaveBeenCalledTimes(1)
    expect(values.get("wallet-fixture")).toBe("preserve")
  })

  it("persists only raw supply plus explicit precision and recomputes cached units", async () => {
    await read()
    const { key, payload } = savedEntry()
    expect(payload.data).toEqual({ totalSupply: "12000000", decimals: 6 })
    payload.data.units = 1e99
    values.set(key, JSON.stringify(payload))
    expect((await read())[token].units).toBe(12)
    expect(fetchEndpoint).toHaveBeenCalledTimes(1)
  })

  it.each([null, {}, { totalSupply: "12000000" }, { totalSupply: "-1", decimals: 6 },
    { totalSupply: "12000000", decimals: 1.5 }])("revalidates cached raw fields: %j", async (invalid) => {
    await read()
    const { key, payload } = savedEntry()
    values.set(key, JSON.stringify({ ...payload, data: invalid }))
    fetchEndpoint.mockImplementationOnce(async () => response("60000", 3))
    expect((await read())[token].units).toBe(60)
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
  })

  it.each([null, "now", -1, 1e99])("rejects invalid or future cache timestamps: %j", async (ts) => {
    await read()
    const { key, payload } = savedEntry()
    values.set(key, JSON.stringify({ ...payload, ts }))
    fetchEndpoint.mockImplementationOnce(async () => response("60000", 3))
    expect((await read())[token].units).toBe(60)
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
  })

  it("expires at 15 minutes without extending freshness on cache reads", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    await read()
    now.mockReturnValue(900999)
    expect((await read())[token].units).toBe(12)
    expect(fetchEndpoint).toHaveBeenCalledTimes(1)
    now.mockReturnValue(901000)
    fetchEndpoint.mockImplementationOnce(async () => response("60000", 3))
    expect((await read())[token].units).toBe(60)
    expect(fetchEndpoint).toHaveBeenCalledTimes(2)
  })

  it("isolates fresh persistent supply by both chain and configured LCD", async () => {
    const scopes = [scope, { ...scope, chainId: "other-chain" }, { ...scope, lcd: "https://other.test" }]
    let count = 0
    fetchEndpoint.mockImplementation(async () => response(String(++count), 0))
    const first = await Promise.all(scopes.map((item) => fetchCw20Supplies([token], {}, item)))
    const cached = await Promise.all(scopes.map((item) => fetchCw20Supplies([token], {}, item)))
    expect(first.map((item) => item[token].units)).toEqual([1, 2, 3])
    expect(cached).toEqual(first)
    expect(fetchEndpoint).toHaveBeenCalledTimes(3)
  })

  it("keeps healthy siblings cached while malformed and failed siblings can retry", async () => {
    fetchEndpoint.mockImplementation(async (url: string) => {
      if (url.includes("/missing/")) return response("12000000", null)
      if (url.includes("/failed/")) throw new Error("fixture offline")
      return response()
    })
    const contracts = [token, "missing", "failed"]
    expect(Object.keys(await fetchCw20Supplies(contracts, {}, scope))).toEqual([token])
    fetchEndpoint.mockImplementation(async () => response("0", 0))
    const retried = await fetchCw20Supplies(contracts, {}, scope)
    expect(retried[token].units).toBe(12)
    expect(retried.missing.units).toBe(0)
    expect(retried.failed.units).toBe(0)
    expect(fetchEndpoint).toHaveBeenCalledTimes(5)
  })

  it("normalizes duplicate contracts and retains the four-worker limit", async () => {
    let active = 0
    let maximum = 0
    fetchEndpoint.mockImplementation(async () => {
      active++
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active--
      return response()
    })
    const contracts = [token.toUpperCase(), ` ${token} `, "", ...Array.from({ length: 12 }, (_, i) => `token${i}`)]
    expect(Object.keys(await fetchCw20Supplies(contracts, {}, scope))).toHaveLength(13)
    expect(fetchEndpoint).toHaveBeenCalledTimes(13)
    expect(maximum).toBe(4)
    expect(await fetchCw20Supplies([], {}, scope)).toEqual({})
  })

  it("releases malformed JSON reads instead of caching failure", async () => {
    fetchEndpoint.mockImplementationOnce(async () => ({
      ok: true, json: async () => { throw new Error("invalid JSON fixture") }
    }))
    expect(await read()).toEqual({})
    expect((await read())[token].units).toBe(12)
  })

  it("keeps live reads working when storage cannot be accessed", async () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked storage") } })
    expect((await read())[token].units).toBe(12)
  })

  it("keeps live reads working when persistence fails", async () => {
    vi.stubGlobal("window", { localStorage: { ...storage, setItem: () => { throw new Error("quota") } } })
    expect((await read())[token].units).toBe(12)
  })
})
