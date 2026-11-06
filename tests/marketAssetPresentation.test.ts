import { describe, expect, it } from "vitest"
import { hydrateMarketCw20Presentation } from "../src/app/market/assetPresentation"
import { getCw20SupplyUnitsForDecimals } from "../src/app/data/cw20"

const asset = {
  id: "cw20:TOKEN", key: "token", symbol: "OLD", name: "Old label",
  decimals: 6, iconCandidates: ["/old.png"], isLunc: false, isUstc: false
}
const token = { token: "token", symbol: "NEW", name: "New label", decimals: 8, icon: "/new.png" }

describe("Market display-only CW20 hydration", () => {
  it("updates labels and icons without rewriting already-normalized price units", () => {
    const original = Object.freeze({ ...asset })
    const hydrated = hydrateMarketCw20Presentation(original, { token })
    expect(hydrated.symbol).toBe("NEW")
    expect(hydrated.name).toBe("New label")
    expect(hydrated.iconCandidates).toContain("/new.png")
    expect(hydrated.decimals).toBe(6)
    expect(hydrated.id).toBe(asset.id)
    expect(hydrated.key).toBe(asset.key)
    expect(original).toEqual(asset)
  })

  it("cannot bypass the supply/price precision guard with newer display metadata", () => {
    const hydrated = hydrateMarketCw20Presentation(asset, { token })
    const supply = { totalSupply: "1000000000", decimals: 8, units: 10 }
    expect(getCw20SupplyUnitsForDecimals(supply, hydrated.decimals)).toBeUndefined()
    const matching = { totalSupply: "1000000000", decimals: 6, units: 1000 }
    expect(getCw20SupplyUnitsForDecimals(matching, hydrated.decimals)).toBe(1000)
  })

  it("preserves a price rebuilt with non-six precision and valid zero supply", () => {
    const hydrated = hydrateMarketCw20Presentation({ ...asset, decimals: 8 }, { token })
    expect(getCw20SupplyUnitsForDecimals({ totalSupply: "0", decimals: 8, units: 0 }, hydrated.decimals)).toBe(0)
  })

  it("preserves missing/native identities and existing label fallbacks", () => {
    expect(hydrateMarketCw20Presentation(asset, {})).toBe(asset)
    const native = { ...asset, id: "native:uluna" }
    expect(hydrateMarketCw20Presentation(native, { token })).toBe(native)
    const hydrated = hydrateMarketCw20Presentation(asset, { token: { ...token, symbol: "", name: "" } })
    expect(hydrated.symbol).toBe("OLD")
    expect(hydrated.name).toBe("OLD")
  })
})
