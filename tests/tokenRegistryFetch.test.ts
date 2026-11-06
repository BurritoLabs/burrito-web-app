import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/app/config/externalServices", () => ({
  BURRITO_REGISTRY_API_URL: "https://registry.test",
  ASSET_URL: "https://assets.test"
}))

const contract = `terra1${"q".repeat(38)}`
const otherContract = `terra1${"p".repeat(38)}`
const asset = (overrides: Record<string, unknown> = {}) => ({
  chainId: "columbus-5",
  type: "cw20",
  assetKey: contract,
  name: "Test Token",
  symbol: "TEST",
  decimals: 6,
  logoUrl: null,
  verificationStatus: "verified",
  verificationMethod: "on-chain",
  ...overrides
})
const response = (assets: unknown = [asset()]) => ({
  ok: true,
  json: async () => ({ assets })
})

describe("verified registry fetching", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([
    ["network rejection", () => Promise.reject(new Error("offline"))],
    ["synchronous fetch failure", () => { throw new Error("fetch unavailable") }],
    ["HTTP error", () => Promise.resolve({ ok: false, status: 503 })],
    ["invalid JSON", () => Promise.resolve({ ok: true, json: async () => { throw new Error("invalid JSON") } })],
    ["missing assets", () => Promise.resolve({ ok: true, json: async () => ({}) })],
    ["non-array assets", () => Promise.resolve(response({}))],
    ["null assets", () => Promise.resolve(response(null))],
    ["null payload", () => Promise.resolve({ ok: true, json: async () => null })],
    ["malformed records only", () => Promise.resolve(response([null, { type: "cw20", assetKey: 7 }]))]
  ])("allows immediate retry after %s", async (_label, failure) => {
    const fetchMock = vi.fn().mockImplementationOnce(failure).mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")

    expect(await fetchVerifiedTokenRegistry("lunc")).toEqual({ cw20: {}, ibc: {} })
    expect((await fetchVerifiedTokenRegistry("lunc")).cw20[contract]?.symbol).toBe("TEST")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("deduplicates pending requests even beyond the TTL, then starts the TTL at success", async () => {
    let complete!: (value: ReturnType<typeof response>) => void
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
      .mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")

    const first = fetchVerifiedTokenRegistry("lunc")
    vi.setSystemTime(Date.now() + 6 * 60_000)
    const second = fetchVerifiedTokenRegistry("lunc")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    complete(response())
    const [one, two] = await Promise.all([first, second])
    expect(one).toBe(two)
    vi.setSystemTime(Date.now() + 5 * 60_000 - 1)
    expect(await fetchVerifiedTokenRegistry("lunc")).toBe(one)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 1)
    await fetchVerifiedTokenRegistry("lunc")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("deduplicates a failed request but evicts it before the next attempt", async () => {
    let reject!: (reason: Error) => void
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
      .mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    const pending = [fetchVerifiedTokenRegistry("lunc"), fetchVerifiedTokenRegistry("lunc")]
    expect(fetchMock).toHaveBeenCalledTimes(1)
    reject(new Error("offline"))
    expect(await Promise.all(pending)).toEqual([{ cw20: {}, ibc: {} }, { cw20: {}, ibc: {} }])
    expect((await fetchVerifiedTokenRegistry("lunc")).cw20[contract]).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps both caches and returned CW20/IBC assets chain-isolated", async () => {
    const hash = "A".repeat(64)
    const fetchMock = vi.fn().mockResolvedValue(response([
      asset(),
      asset({ chainId: "phoenix-1", assetKey: otherContract, symbol: "OTHER" }),
      asset({ type: "ibc", assetKey: `ibc/${hash}` }),
      asset({ type: "ibc", chainId: "phoenix-1", assetKey: `ibc/${"B".repeat(64)}` })
    ]))
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    const [classic, terra] = await Promise.all([fetchVerifiedTokenRegistry("lunc"), fetchVerifiedTokenRegistry("luna")])
    expect(Object.keys(classic.cw20)).toEqual([contract])
    expect(Object.keys(terra.cw20)).toEqual([otherContract])
    expect(Object.keys(classic.ibc)).toEqual([hash])
    expect(Object.keys(terra.ibc)).toEqual(["B".repeat(64)])
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://registry.test/v1/registry/assets?chain=lunc&limit=1000&pagination=cursor",
      "https://registry.test/v1/registry/assets?chain=luna&limit=1000&pagination=cursor"
    ])
    await Promise.all([fetchVerifiedTokenRegistry("lunc"), fetchVerifiedTokenRegistry("luna")])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("skips malformed records without losing valid assets or upgrading verification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      null, 7, {},
      asset({ assetKey: 4 }),
      asset({ type: "unknown", assetKey: "A".repeat(64) }),
      asset({ symbol: { malicious: true } }),
      asset({ decimals: null, verificationStatus: "unverified" })
    ])))
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    const result = await fetchVerifiedTokenRegistry("lunc")
    expect(Object.keys(result.cw20)).toEqual([contract])
    expect(result.cw20[contract]).toMatchObject({ symbol: "TEST", verificationStatus: "unverified", verificationMethod: "on-chain" })
    expect(result.cw20[contract].decimals).toBeUndefined()
    expect(result.ibc).toEqual({})
  })

  it("caches a genuinely empty successful registry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([]))
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    await fetchVerifiedTokenRegistry("lunc")
    await fetchVerifiedTokenRegistry("lunc")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not refresh an expired success when its refresh fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(response([asset({ symbol: "NEW" })]))
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    await fetchVerifiedTokenRegistry("lunc")
    vi.setSystemTime(Date.now() + 5 * 60_000)
    expect(await fetchVerifiedTokenRegistry("lunc")).toEqual({ cw20: {}, ibc: {} })
    expect((await fetchVerifiedTokenRegistry("lunc")).cw20[contract].symbol).toBe("NEW")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("accepts nullable optional metadata without inventing provenance", async () => {
    const hash = "C".repeat(64)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      asset({ verificationStatus: null, verificationMethod: null, originChainId: null,
        originDenom: null, issuer: null, transport: null, provenanceLabel: null, source: null }),
      asset({ type: "ibc", assetKey: `ibc/${hash}`, baseDenom: null, path: null })
    ])))
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    const result = await fetchVerifiedTokenRegistry("lunc")
    expect(result.cw20[contract]?.symbol).toBe("TEST")
    for (const key of ["verificationStatus", "verificationMethod", "originChainId", "originDenom",
      "issuer", "transport", "provenanceLabel", "source"] as const) {
      expect(result.cw20[contract][key]).toBeUndefined()
    }
    expect(result.ibc[hash]).toMatchObject({ symbol: "TEST", base_denom: `ibc/${hash}` })
    expect(result.ibc[hash].path).toBeUndefined()
  })

  it("follows server continuation past 1000 entries and caches only the completed traversal", async () => {
    const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    const key = (index: number) => `terra1${"q".repeat(35)}${alphabet[(index >> 10) & 31]}${alphabet[(index >> 5) & 31]}${alphabet[index & 31]}`
    const firstPage = Array.from({ length: 1000 }, (_, index) => asset({ assetKey: key(index) }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assets: firstPage, pagination: { hasMore: true, nextCursor: "cursor+/=" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assets: [asset({ assetKey: key(1000) })], pagination: { hasMore: false, nextCursor: null } }) })
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    const result = await fetchVerifiedTokenRegistry("lunc")
    expect(Object.keys(result.cw20)).toHaveLength(1001)
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("cursor")).toBe("cursor+/=")
    expect(await fetchVerifiedTokenRegistry("lunc")).toBe(result)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(["HTTP failure", "repeated cursor", "invalid pagination", "missing continuation metadata"])(
    "does not cache a first-page-only success after %s", async (kind) => {
      const first = { ok: true, json: async () => ({ assets: [asset()], pagination: { hasMore: true, nextCursor: "next" } }) }
      const second = kind === "HTTP failure" ? { ok: false, status: 503 }
        : kind === "repeated cursor" ? first
          : kind === "missing continuation metadata" ? response()
          : { ok: true, json: async () => ({ assets: [asset()], pagination: { hasMore: "yes", nextCursor: null } }) }
      const fetchMock = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValue(response())
      vi.stubGlobal("fetch", fetchMock)
      const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
      expect(await fetchVerifiedTokenRegistry("lunc")).toEqual({ cw20: {}, ibc: {} })
      expect((await fetchVerifiedTokenRegistry("lunc")).cw20[contract]).toBeDefined()
      expect(fetchMock).toHaveBeenCalledTimes(3)
    }
  )

  it.each(["headers", "body"])("bounds stalled %s even if the transport ignores abort", async (kind) => {
    const never = new Promise<never>(() => {})
    const fetchMock = vi.fn().mockImplementationOnce(() => kind === "headers" ? never : Promise.resolve({ ok: true, json: () => never }))
      .mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const { fetchVerifiedTokenRegistry } = await import("../src/app/data/tokenRegistry")
    const pending = fetchVerifiedTokenRegistry("lunc")
    await vi.advanceTimersByTimeAsync(2_500)
    expect(await pending).toEqual({ cw20: {}, ibc: {} })
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    expect((await fetchVerifiedTokenRegistry("lunc")).cw20[contract]).toBeDefined()
  })
})
