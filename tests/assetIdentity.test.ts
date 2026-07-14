import { afterEach, describe, expect, it } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import {
  formatBaseDenomSymbol,
  formatNativeSymbol,
  isSafeDisplaySymbol,
  isSafeNativeDenom,
  normalizeSafeMarketAssetId,
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

  it("rejects hostile market identifiers and display symbols", () => {
    expect(normalizeSafeMarketAssetId("native:" + "X".repeat(6_000))).toBeUndefined()
    expect(normalizeSafeMarketAssetId("native:native:uluna")).toBeUndefined()
    expect(isSafeNativeDenom(`ibc/${"A".repeat(64)}`)).toBe(true)
    expect(isSafeDisplaySymbol("TOKEN".repeat(20))).toBe(false)
    expect(resolveSafeDisplaySymbol("\u0000BAD", "IBC")).toBe("IBC")
  })
})
