import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const denom = "factory/terra1creator/test"
const hash = "A".repeat(64)
const scope = { chainId: "precision-fixture", chainKey: "lunc" as const, lcd: "https://precision.invalid", name: "Terra Classic" }
const asset = (exponent: unknown) => ({
  base: denom, display: "TEST", symbol: "TEST", name: "Registry identity",
  denom_units: [{ denom, exponent: 0 }, { denom: "TEST", exponent }],
  logo_URIs: { png: "/tokens/registry.png" }
})
const metadata = (exponent: unknown = 8, base = denom) => ({
  base, display: "TEST", symbol: "TEST", name: "Chain identity",
  denom_units: [{ denom: base, exponent: 0 }, { denom: "TEST", exponent }]
})
beforeEach(() => vi.resetModules())
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("native and IBC explicit precision", () => {
  it.each([undefined, -1, 1.5, "8", NaN, Infinity, 309])("does not invent registry precision for %s", async exponent => {
    const { mapCosmosRegistryAssets } = await import("../src/app/data/terraAssets")
    const mapped = mapCosmosRegistryAssets({ assets: [asset(exponent)] } as never)
    expect(mapped.native[denom].decimals).toBeUndefined()
    expect(mapped.native[denom]).toMatchObject({ symbol: "TEST", name: "Registry identity" })
  })

  it("requires the declared display unit rather than choosing an arbitrary exponent", async () => {
    const { mapCosmosRegistryAssets } = await import("../src/app/data/terraAssets")
    const mapped = mapCosmosRegistryAssets({ assets: [{ ...asset(8), display: "missing" }] } as never)
    expect(mapped.native[denom].decimals).toBeUndefined()
  })

  it.each([0, 6, 8, 18])("preserves explicit registry precision %s", async exponent => {
    const { mapCosmosRegistryAssets } = await import("../src/app/data/terraAssets")
    expect(mapCosmosRegistryAssets({ assets: [asset(exponent)] } as never).native[denom].decimals).toBe(exponent)
  })

  it.each([null, -1, 1.5, 31])("keeps missing/invalid Burrito registry precision %s unknown", async decimals => {
    const { mapVerifiedRegistryAssets } = await import("../src/app/data/tokenRegistry")
    const result = mapVerifiedRegistryAssets([{ chainId: scope.chainId, type: "ibc", assetKey: `ibc/${hash}`,
      name: "Owned identity", symbol: "OWN", decimals, logoUrl: null, issuer: "Issuer", verifiedAt: 1, updatedAt: 1 }])
    expect(result.ibc[hash].decimals).toBeUndefined()
    expect(result.ibc[hash]).toMatchObject({ symbol: "OWN", issuer: "Issuer" })
  })

  it("rejects mismatched bank metadata identity even when its exponent is valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async input => Response.json(String(input).includes("denoms_metadata/")
      ? { metadata: metadata(8, "different-denom") } : { assets: [] })))
    const { fetchNativeMetadataToken } = await import("../src/app/data/terraAssets")
    expect((await fetchNativeMetadataToken(denom, scope))?.decimals).toBeUndefined()
  })

  it("recovers unknown registry precision from matching bank metadata without losing identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async input => Response.json(String(input).includes("denoms_metadata/")
      ? { metadata: metadata(8) } : { assets: [{ ...asset(8), display: "missing" }] })))
    const { fetchNativeMetadataToken } = await import("../src/app/data/terraAssets")
    expect(await fetchNativeMetadataToken(denom, { ...scope, chainKey: "luna" })).toMatchObject({ decimals: 8, symbol: "TEST", name: "Registry identity", icon: "/tokens/registry.png" })
  })

  it("ignores legacy guessed-six native cache and preserves known native constants", async () => {
    const storage = new Map([["burritoNativeTokenCacheV2", JSON.stringify({
      [`${scope.chainId}:${denom}`]: { ts: Date.now(), token: { denom, symbol: "OLD", name: "Old cache", decimals: 6 } }
    })]])
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    vi.stubGlobal("fetch", vi.fn(async input => Response.json(String(input).includes("denoms_metadata/") ? { metadata: metadata(8) } : { assets: [] })))
    const { fetchNativeMetadataToken } = await import("../src/app/data/terraAssets")
    expect((await fetchNativeMetadataToken(denom, scope))?.decimals).toBe(8)
    for (const key of ["uluna", "uusd"]) expect((await fetchNativeMetadataToken(key, scope))?.decimals).toBe(6)
    expect((await fetchNativeMetadataToken("uluna", { ...scope, chainKey: "luna" }))?.decimals).toBe(6)
  })

  it("unknown trace/Finder precision cannot overwrite an owned registry value or identity", async () => {
    const { mergeResolvedIbcAssets } = await import("../src/app/data/terraAssets")
    const base = { denom: `ibc/${hash}`, base_denom: "uatom", symbol: "OWN", name: "Owned identity", decimals: 8, issuer: "Issuer" }
    const resolved = { ...base, symbol: "IBC", name: "IBC", decimals: undefined }
    expect(mergeResolvedIbcAssets({ [hash]: base }, { [hash]: resolved })[hash]).toMatchObject(base)
  })

  it("uses local full IBC denomination metadata, never an unrelated local short base denom", async () => {
    const requests: string[] = []
    const ibcDenom = `ibc/${hash}`
    vi.stubGlobal("fetch", vi.fn(async input => {
      const url = String(input); requests.push(url)
      if (url.includes("denom_traces/")) return Response.json({ denom_trace: { base_denom: "uatom", path: "transfer/channel-1" } })
      if (url.includes("denoms_metadata/")) {
        const requested = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!)
        return Response.json({ metadata: metadata(requested === ibcDenom ? 8 : 6, requested) })
      }
      return Response.json({ assets: [] })
    }))
    const { fetchResolvedIbcMetadataBatch } = await import("../src/app/data/terraAssets")
    const result = await fetchResolvedIbcMetadataBatch([hash], {}, scope)
    expect(result.tokens[hash]).toMatchObject({ decimals: 8, decimalsVerified: true, base_denom: "uatom" })
    expect(requests.some(url => url.includes(encodeURIComponent(ibcDenom)))).toBe(true)
    expect(requests.some(url => url.endsWith("denoms_metadata/uatom"))).toBe(false)
  })

  it("retains a valid registry precision when a later registry supplies only identity", async () => {
    const { mergeIbcRegistryAssets, mergeResolvedIbcAssets } = await import("../src/app/data/terraAssets")
    const token = { denom: `ibc/${hash}`, base_denom: "uatom", symbol: "REG", name: "Registry", decimals: 8 }
    const own = { ...token, symbol: "OWN", decimals: undefined, issuer: "Issuer" }
    expect(mergeIbcRegistryAssets({ [hash]: token }, { [hash]: own })[hash]).toMatchObject({ symbol: "OWN", decimals: 8, issuer: "Issuer" })
    expect(mergeResolvedIbcAssets({ [hash]: token }, { [hash]: { ...own, decimals: 0, decimalsVerified: true } })[hash].decimals).toBe(0)
  })

  it("keeps the owned registry available when the third-party asset list fails", async () => {
    vi.stubEnv("VITE_BURRITO_REGISTRY_API_URL", "https://registry.invalid")
    vi.stubGlobal("fetch", vi.fn(async input => {
      if (String(input).includes("registry.invalid")) return Response.json({ assets: [{ type: "ibc", assetKey: `ibc/${hash}`, symbol: "OWN", name: "Owned", decimals: 8 }] })
      throw new Error("third-party list offline")
    }))
    const { fetchIbcWhitelist } = await import("../src/app/data/terraAssets")
    expect((await fetchIbcWhitelist(scope))[hash]).toMatchObject({ symbol: "OWN", decimals: 8 })
  })

  it("preserves explicit registry precision priority without querying another source", async () => {
    const fetch = vi.fn(async () => Response.json({ assets: [asset(6)] }))
    vi.stubGlobal("fetch", fetch)
    const { fetchNativeMetadataToken } = await import("../src/app/data/terraAssets")
    expect((await fetchNativeMetadataToken(denom, { ...scope, chainKey: "luna" }))?.decimals).toBe(6)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not cache unknown native precision as success, and isolates configured LCDs", async () => {
    let reads = 0
    const { fetchNativeMetadataToken } = await import("../src/app/data/terraAssets")
    // Omit the declared unit explicitly; helper's default is not the missing case.
    const fetch = vi.fn(async () => Response.json({ metadata: ++reads === 1 ? { ...metadata(), display: "missing" } : metadata(reads === 2 ? 8 : 9) }))
    vi.stubGlobal("fetch", fetch)
    expect((await fetchNativeMetadataToken(denom, scope))?.decimals).toBeUndefined()
    expect((await fetchNativeMetadataToken(denom, scope))?.decimals).toBe(8)
    expect((await fetchNativeMetadataToken(denom, { ...scope, lcd: "https://second.invalid" }))?.decimals).toBe(9)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("market readiness accepts explicit zero and anchors but never guessed or invalid units", async () => {
    const { resolveNativeMarketDecimals, readDenomMetadataDecimals } = await import("../src/app/data/assetPrecision")
    expect(resolveNativeMarketDecimals("uluna", {}, {})).toBe(6)
    expect(resolveNativeMarketDecimals("uusd", {}, {})).toBe(6)
    expect(resolveNativeMarketDecimals(denom, {}, {})).toBeUndefined()
    expect(resolveNativeMarketDecimals(denom, { [denom]: { decimals: 0 } }, {})).toBe(0)
    expect(resolveNativeMarketDecimals(`ibc/${hash}`, {}, { [hash]: { decimals: 8 } })).toBe(8)
    expect(resolveNativeMarketDecimals(`ibc/${hash}`, {}, { [hash]: { decimals: -1 } })).toBeUndefined()
    expect(readDenomMetadataDecimals({ ...metadata(8), denom_units: [...metadata(8).denom_units, { denom: "TEST", exponent: 6 }] } as never)).toBeUndefined()
  })
})
