import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const hash = "B".repeat(64)
const chainId = "ibc-cache-precision-fixture"
const scope = (lcd: string) => ({
  chainId,
  chainKey: "lunc" as const,
  lcd,
  name: "Terra Classic"
})

const bankMetadata = (base: string, decimals?: number) => ({
  metadata: {
    base,
    display: "TOKEN",
    symbol: "TOKEN",
    name: "Fixture token",
    denom_units: [
      { denom: base, exponent: 0 },
      ...(decimals === undefined ? [] : [{ denom: "TOKEN", exponent: decimals }])
    ]
  }
})

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe("IBC precision cache scope and retry", () => {
  it("isolates the same chain and hash across LCDs", async () => {
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      requests.push(url)
      if (url.includes("/denom_traces/")) {
        return Response.json({ denom_trace: { base_denom: "uatom", path: "transfer/channel-1" } })
      }
      if (url.includes("/denoms_metadata/")) {
        const requestedDenom = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!)
        const decimals = url.startsWith("https://lcd-eight.invalid") ? 8 : 9
        return Response.json(bankMetadata(requestedDenom, decimals))
      }
      return Response.json({ assets: [] })
    }))

    const { fetchResolvedIbcMetadataBatch } = await import("../src/app/data/terraAssets")
    const first = await fetchResolvedIbcMetadataBatch([hash], {}, scope("https://lcd-eight.invalid"))
    const second = await fetchResolvedIbcMetadataBatch([hash], {}, scope("https://lcd-nine.invalid"))

    expect(first.tokens[hash]).toMatchObject({ decimals: 8, decimalsVerified: true })
    expect(second.tokens[hash]).toMatchObject({ decimals: 9, decimalsVerified: true })
    expect(requests.some(url => url.startsWith("https://lcd-eight.invalid/"))).toBe(true)
    expect(requests.some(url => url.startsWith("https://lcd-nine.invalid/"))).toBe(true)
  })

  it("does not treat unknown precision as cached success and retries to recover", async () => {
    const requests: string[] = []
    let metadataReads = 0
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      requests.push(url)
      if (url.includes("/denom_traces/")) {
        return Response.json({ denom_trace: { base_denom: "uatom", path: "transfer/channel-1" } })
      }
      if (url.includes("/denoms_metadata/")) {
        const requestedDenom = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!)
        metadataReads += 1
        return Response.json(bankMetadata(requestedDenom, metadataReads === 1 ? undefined : 8))
      }
      return Response.json({ assets: [] })
    }))

    const { fetchResolvedIbcMetadataBatch } = await import("../src/app/data/terraAssets")
    const first = await fetchResolvedIbcMetadataBatch([hash], {}, scope("https://lcd-retry.invalid"))
    const second = await fetchResolvedIbcMetadataBatch([hash], {}, scope("https://lcd-retry.invalid"))

    expect(first.tokens[hash]?.decimals).toBeUndefined()
    expect(first.failedHashes).toEqual([hash])
    expect(second.tokens[hash]).toMatchObject({ decimals: 8, decimalsVerified: true })
    expect(second.failedHashes).toEqual([])
    expect(metadataReads).toBe(2)
    expect(requests.filter(url => url.includes("/denom_traces/")).length).toBe(2)
  })
})
