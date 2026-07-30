import { afterEach, describe, expect, it } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import {
  formatBaseDenomSymbol,
  formatNativeSymbol,
  isSafeDisplaySymbol,
  isSafeNativeDenom,
  normalizeSafeMarketAssetId,
  resolveNativeAssetIdentity,
  resolveSafeDisplaySymbol
} from "../src/app/utils/assetIdentity"

afterEach(() => setActiveAppChainKey("lunc"))

describe("asset identity fallbacks", () => {
  it("keeps token-factory labels compact", () => {
    expect(
      formatBaseDenomSymbol(
        "factory/terra1vklefn7n6cchn0u962w3gaszr4vf52wjvd4y95t2sydwpmpdtszsqvk9wy/ampROAR"
      )
    ).toBe("ampROAR")
    expect(
      formatBaseDenomSymbol(
        "factory:kujira1n3fr5f56r2ce0s37wdvwrk98yhhq3unnxgcqus8nzsfxvllk0yxquurqty:ampKUJI"
      )
    ).toBe("ampKUJI")
  })

  it("does not add Classic suffixes to Phoenix micro denoms", () => {
    setActiveAppChainKey("luna")
    expect(formatNativeSymbol("ucre")).toBe("CRE")
    expect(formatNativeSymbol("uusdc")).toBe("USDC")
  })

  it("only applies Classic suffixes to known Classic stable denoms", () => {
    setActiveAppChainKey("lunc")
    expect(formatNativeSymbol("ukrw")).toBe("KRTC")
    expect(formatNativeSymbol("ucre")).toBe("CRE")
  })

  it("does not allow registry metadata to relabel canonical Classic assets", () => {
    expect(
      resolveNativeAssetIdentity({
        denom: "uusd",
        candidateSymbol: "USDC",
        candidateName: "USD Coin",
        chainKey: "lunc"
      })
    ).toEqual({
      symbol: "USTC",
      name: "TerraClassicUSD"
    })
    expect(
      resolveNativeAssetIdentity({
        denom: "uluna",
        candidateSymbol: "LUNA",
        candidateName: "Terra",
        chainKey: "lunc"
      })
    ).toEqual({
      symbol: "LUNC",
      name: "Terra Classic"
    })
  })

  it("keeps IBC asset identity separate from the native uusd identity", () => {
    const nobleUsdc =
      `ibc/${"0BB9D8513E8E8E9AE6A9D211D9136E6DA42288DDE6CFAA453A150A4566054DC5"}`

    expect(normalizeSafeMarketAssetId("native:uusd")).toBe("native:uusd")
    expect(normalizeSafeMarketAssetId(`native:${nobleUsdc}`)).toBe(
      `native:${nobleUsdc}`
    )
    expect(normalizeSafeMarketAssetId(`native:${nobleUsdc}`)).not.toBe(
      normalizeSafeMarketAssetId("native:uusd")
    )
  })

  it("rejects hostile market identifiers and display symbols", () => {
    expect(normalizeSafeMarketAssetId("native:" + "X".repeat(6_000))).toBeUndefined()
    expect(normalizeSafeMarketAssetId("native:native:uluna")).toBeUndefined()
    expect(isSafeNativeDenom(`ibc/${"A".repeat(64)}`)).toBe(true)
    expect(isSafeDisplaySymbol("TOKEN".repeat(20))).toBe(false)
    expect(resolveSafeDisplaySymbol("\u0000BAD", "IBC")).toBe("IBC")
  })
})
