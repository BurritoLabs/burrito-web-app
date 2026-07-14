import { describe, expect, it } from "vitest"
import {
  getMarketDexFilterOptions,
  getStandardLiquidityDexLabels
} from "../src/app/market/dexFilters"

describe("chain-specific market DEX filters", () => {
  it("shows only Phoenix DEXes on LUNA", () => {
    expect(getMarketDexFilterOptions("luna").map((option) => option.value)).toEqual([
      "all",
      "astroport",
      "terraswap",
      "phoenix",
      "white-whale"
    ])
  })

  it("keeps Classic-only DEXes off LUNA", () => {
    const lunaFilters = new Set(
      getMarketDexFilterOptions("luna").map((option) => option.value)
    )

    expect(lunaFilters.has("terraport")).toBe(false)
    expect(lunaFilters.has("garuda")).toBe(false)
    expect(lunaFilters.has("luncswap")).toBe(false)
    expect(lunaFilters.has("luncpump")).toBe(false)
  })

  it("does not show the Phoenix-only filter on Classic", () => {
    const classicFilters = new Set(
      getMarketDexFilterOptions("lunc").map((option) => option.value)
    )

    expect(classicFilters.has("phoenix")).toBe(false)
    expect(classicFilters.has("terraport")).toBe(true)
  })

  it("uses chain-specific DEX names in liquidity support copy", () => {
    expect(getStandardLiquidityDexLabels("luna")).toBe(
      "Terraswap, Astroport, and Phoenix"
    )
    expect(getStandardLiquidityDexLabels("lunc")).toContain("Terraport")
    expect(getStandardLiquidityDexLabels("luna")).not.toContain("Terraport")
  })
})
