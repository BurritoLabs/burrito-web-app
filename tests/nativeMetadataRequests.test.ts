import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchNativeMetadataToken } from "../src/app/data/terraAssets"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const metadataResponse = (display: string, exponent: number) =>
  Response.json({ metadata: {
    base: `u${display}`,
    display,
    name: `Verified ${display}`,
    symbol: display.toUpperCase(),
    denom_units: [
      { denom: `u${display}`, exponent: 0 },
      { denom: display, exponent }
    ]
  } })

const scope = (chainId: string, lcd: string) => ({
  chainId,
  chainKey: "lunc" as const,
  lcd,
  name: "Test chain"
})

describe("native metadata request coordination", () => {
  it("shares a pending LCD metadata read for the same chain and full URL", async () => {
    const denom = "uunitflight"
    const lcd = "https://terra-classic-lcd.publicnode.com"
    const requestedUrls: string[] = []
    let releaseResponse!: () => void
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(input.toString())
      await responseGate
      return metadataResponse("unitflight", 9)
    }))

    const chainScope = scope("native-meta-inflight-red-green", lcd)
    const first = fetchNativeMetadataToken(denom, chainScope)
    const duplicate = fetchNativeMetadataToken(denom, chainScope)
    const bothResults = Promise.all([first, duplicate])
    await new Promise((resolve) => setTimeout(resolve, 0))
    const requestCountWhilePending = requestedUrls.length
    releaseResponse()
    const [firstToken, duplicateToken] = await bothResults

    expect(requestCountWhilePending).toBe(1)
    expect(firstToken).toMatchObject({ denom, symbol: "UNITFLIGHT", decimals: 9 })
    expect(duplicateToken).toEqual(firstToken)
    expect(requestedUrls).toEqual([`${lcd}/cosmos/bank/v1beta1/denoms_metadata/${denom}`])
  })

  it("does not share reads across chains or different LCD URLs", async () => {
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requests.push(input.toString())
      return metadataResponse("scopecheck", 8)
    }))

    const firstLcd = "https://terra-classic-lcd.publicnode.com"
    const secondLcd = "https://lcd.terra-classic.hexxagon.io"
    const chainScopedDenom = "uchainisolated"
    const endpointScopedDenom = "uendpointisolated"
    await Promise.all([
      fetchNativeMetadataToken(chainScopedDenom, scope("native-meta-chain-a", firstLcd)),
      fetchNativeMetadataToken(chainScopedDenom, scope("native-meta-chain-b", firstLcd)),
      fetchNativeMetadataToken(endpointScopedDenom, scope("native-meta-endpoint", firstLcd)),
      fetchNativeMetadataToken(endpointScopedDenom, scope("native-meta-endpoint", secondLcd))
    ])

    expect(requests).toHaveLength(4)
    expect(requests).toContain(`${firstLcd}/cosmos/bank/v1beta1/denoms_metadata/${chainScopedDenom}`)
    expect(requests).toContain(`${firstLcd}/cosmos/bank/v1beta1/denoms_metadata/${endpointScopedDenom}`)
    expect(requests).toContain(`${secondLcd}/cosmos/bank/v1beta1/denoms_metadata/${endpointScopedDenom}`)
  })

  it("retries after a failed read without negative caching", async () => {
    const denom = "uretrymetadata"
    const lcd = "https://terra-classic-lcd.publicnode.com"
    let calls = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++
      if (calls <= 3) throw new Error("fixture endpoint unavailable")
      return metadataResponse("retrymetadata", 7)
    }))

    const chainScope = scope("native-meta-retry-no-negative-cache", lcd)
    await expect(fetchNativeMetadataToken(denom, chainScope)).rejects.toThrow("fixture endpoint unavailable")
    await expect(fetchNativeMetadataToken(denom, chainScope)).resolves.toMatchObject({
      denom,
      symbol: "RETRYMETADATA",
      decimals: 7
    })
    expect(calls).toBe(4)
  })
})
