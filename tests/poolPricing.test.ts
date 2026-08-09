import { describe, expect, it } from "vitest"
import {
  resolveBondingSpotPrice,
  supportsReserveRatioPricing
} from "../src/app/market/poolPricing"

describe("pool pricing", () => {
  it("does not treat bonding custody balances as an XYK reserve price", () => {
    expect(supportsReserveRatioPricing("bonding-burrito")).toBe(false)
    expect(supportsReserveRatioPricing("xyk")).toBe(true)
  })

  it("uses and reverses the published bonding spot price by display order", () => {
    const common = {
      spotPriceAmount: "2.5",
      spotPriceAssetId: "native:uluna"
    }
    expect(
      resolveBondingSpotPrice({
        ...common,
        priceBaseId: "cw20:terra1token",
        priceQuoteId: "native:uluna"
      })
    ).toBe(2.5)
    expect(
      resolveBondingSpotPrice({
        ...common,
        priceBaseId: "native:uluna",
        priceQuoteId: "cw20:terra1token"
      })
    ).toBe(0.4)
  })

  it("rejects invalid or unrelated bonding prices", () => {
    expect(
      resolveBondingSpotPrice({
        priceBaseId: "cw20:terra1token",
        priceQuoteId: "native:uluna",
        spotPriceAmount: "0",
        spotPriceAssetId: "native:uluna"
      })
    ).toBeUndefined()
    expect(
      resolveBondingSpotPrice({
        priceBaseId: "cw20:terra1token",
        priceQuoteId: "native:uluna",
        spotPriceAmount: "2.5",
        spotPriceAssetId: "native:uusd"
      })
    ).toBeUndefined()
  })
})
