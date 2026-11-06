import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const registry = vi.hoisted(() => vi.fn())
vi.mock("../src/app/data/tokenRegistry", () => ({ fetchVerifiedTokenRegistry: registry }))
const contract = "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0"
const scope = { chainId: "phoenix-1", chainKey: "luna" as const, lcd: "https://lcd.test", name: "Terra" }
const token = { token: contract, symbol: "REAL", name: "Real Token", decimals: 8 }

beforeEach(() => {
  vi.resetModules()
  registry.mockResolvedValue({ cw20: {}, ibc: {} })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks() })

describe("CW20 registry resilience", () => {
  it("retains own registry tokens when the legacy source fails", async () => {
    registry.mockResolvedValue({ cw20: { [contract]: token }, ibc: {} })
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    expect((await fetchCw20Whitelist(scope))[contract]).toEqual(token)
  })

  it("loads supplemental assets independently and preserves verified precedence", async () => {
    registry.mockResolvedValue({ cw20: { [contract]: token }, ibc: {} })
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("tokens.json")
      ? new Response("unavailable", { status: 503 })
      : Response.json({ assets: [{ base: `cw20:${contract}`, symbol: "OTHER", name: "Other", display: "other", denom_units: [{ denom: "other", exponent: 6 }] }] })))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    expect((await fetchCw20Whitelist(scope))[contract]).toEqual(token)
  })

  it("returns supplemental CW20s alone after legacy failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("tokens.json")
      ? new Response("unavailable", { status: 503 })
      : Response.json({ assets: [{ base: `cw20:${contract}`, symbol: "REAL", name: "Real Token", display: "real", denom_units: [{ denom: "real", exponent: 8 }] }] })))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    expect((await fetchCw20Whitelist(scope))[contract]?.symbol).toBe("REAL")
  })

  it("rejects retryably when all remote CW20 sources are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    await expect(fetchCw20Whitelist(scope)).rejects.toThrow("CW20")
  })

  it("bounds a stalled legacy body even when transport ignores cancellation", async () => {
    vi.useFakeTimers()
    registry.mockResolvedValue({ cw20: { [contract]: token }, ibc: {} })
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("tokens.json")
      ? { ok: true, json: () => new Promise(() => {}) }
      : new Response("unavailable", { status: 503 })))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    const pending = fetchCw20Whitelist(scope)
    await vi.advanceTimersByTimeAsync(8_001)
    expect((await pending)[contract]).toEqual(token)
  })

  it("never injects Classic trusted tokens into an empty Luna list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    expect(await fetchCw20Whitelist(scope)).toEqual({})
  })

  it.each(["headers", "body"])("bounds stalled supplemental %s and retries instead of caching failure", async (phase) => {
    vi.useFakeTimers()
    registry.mockResolvedValue({ cw20: { [contract]: token }, ibc: {} })
    let supplementalCalls = 0
    let supplementalSignal: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("tokens.json")) return new Response("unavailable", { status: 503 })
      supplementalCalls += 1
      supplementalSignal = init?.signal ?? undefined
      if (supplementalCalls === 1) {
        if (phase === "headers") return new Promise(() => {})
        return { ok: true, json: () => new Promise(() => {}) }
      }
      return Response.json({ assets: [{ base: `cw20:${contract}`, symbol: "RETRIED", name: "Retry Token", display: "real", denom_units: [{ denom: "real", exponent: 8 }] }] })
    }))
    const { fetchCw20Whitelist } = await import("../src/app/data/terraAssets")
    const pending = fetchCw20Whitelist(scope)
    await vi.advanceTimersByTimeAsync(8_001)
    expect((await pending)[contract]).toEqual(token)
    expect(supplementalSignal?.aborted).toBe(true)
    registry.mockResolvedValue({ cw20: {}, ibc: {} })
    expect((await fetchCw20Whitelist(scope))[contract]?.symbol).toBe("RETRIED")
    expect(supplementalCalls).toBe(2)
  })

  it.each([`CW20-${contract.slice(6, 12).toUpperCase()}`, "terra1", "MEANINGFUL"])("resolves placeholder %s but preserves meaningful metadata", async (symbol) => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const query = JSON.parse(atob(input.split("/smart/")[1]))
      return Response.json({ data: query.token_info ? token : { logo: { url: "https://example.com/logo.png" } } })
    }))
    const { fetchCw20TokenInfos } = await import("../src/app/data/terraAssets")
    const result = await fetchCw20TokenInfos([contract], { [contract]: { ...token, symbol, name: symbol, icon: "/system/cw20.svg" } }, scope, { skipFinder: true })
    expect(result[contract]?.symbol).toBe(symbol === "MEANINGFUL" ? symbol : "REAL")
    expect(result[contract]?.icon).toBe("https://example.com/logo.png")
  })
})
