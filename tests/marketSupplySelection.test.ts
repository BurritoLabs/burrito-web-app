import { describe, expect, it } from "vitest"
import {
  selectCw20MarketSupplyContracts,
  type MarketSupplyCandidate
} from "../src/app/market/marketSupplySelection"
import { guardChainRelativeValuation } from "../src/app/market/valuationGuard"

const card = (contract: string, changes: Partial<MarketSupplyCandidate> = {}): MarketSupplyCandidate => ({
  priceBase: { id: `cw20:${contract}`, isLunc: false, isUstc: false },
  priceUsd: 1,
  priceConfidenceUsd: 1000,
  ...changes
})

describe("Market CW20 supply selection", () => {
  it("does not query supply for a card whose price is not available", () => {
    expect(selectCw20MarketSupplyContracts([
      card("priced"), card("unpriced", { priceUsd: undefined })
    ])).toEqual(["priced"])
  })

  it("does not query supply for a card below the existing confidence threshold", () => {
    expect(selectCw20MarketSupplyContracts([
      card("eligible"), card("low", { priceConfidenceUsd: 999 }),
      card("missing", { priceConfidenceUsd: undefined })
    ])).toEqual(["eligible"])
  })

  it("does not query supply when the card already has a market cap, including zero", () => {
    expect(selectCw20MarketSupplyContracts([
      card("needed"), card("known", { marketCapUsd: 1200 }), card("zero", { marketCapUsd: 0 })
    ])).toEqual(["needed"])
  })

  it("uses the native valuation branches rather than supply for chain-native flags", () => {
    expect(selectCw20MarketSupplyContracts([
      card("needed"),
      card("native-lunc", { priceBase: { id: "cw20:native-lunc", isLunc: true, isUstc: false } }),
      card("native-ustc", { priceBase: { id: "cw20:native-ustc", isLunc: false, isUstc: true } })
    ])).toEqual(["needed"])
  })

  it.each([
    ["zero price", { priceUsd: 0 }, true],
    ["threshold", { priceConfidenceUsd: 1000 }, true],
    ["below threshold", { priceConfidenceUsd: 999.999 }, false],
    ["zero confidence", { priceConfidenceUsd: 0 }, false],
    // Preserve legacy comparison semantics; these do not certify invalid inputs.
    ["NaN confidence", { priceConfidenceUsd: NaN }, true],
    ["NaN price", { priceUsd: NaN }, true],
    ["infinite price", { priceUsd: Infinity }, true],
    ["defined NaN cap", { marketCapUsd: NaN }, false],
    ["defined infinite cap", { marketCapUsd: Infinity }, false]
  ] as const)("preserves the existing valuation boundary: %s", (_label, changes, included) => {
    expect(selectCw20MarketSupplyContracts([card("token", changes)]))
      .toEqual(included ? ["token"] : [])
  })

  it("includes a contract when any of its cards needs supply, regardless of order", () => {
    const candidates = [
      card("TOKEN", { priceUsd: undefined }),
      card("token", { marketCapUsd: 0 }),
      card("ToKeN"),
      card("unused", { priceConfidenceUsd: 999 })
    ]
    expect(selectCw20MarketSupplyContracts(candidates)).toEqual(["token"])
    expect(selectCw20MarketSupplyContracts([...candidates].reverse())).toEqual(["token"])
    expect(selectCw20MarketSupplyContracts(candidates.filter((item) => item.priceBase.id !== "cw20:ToKeN")))
      .toEqual([])
  })

  it("does not send native or IBC asset identifiers to the CW20 supply endpoint", () => {
    expect(selectCw20MarketSupplyContracts([
      card("needed"),
      card("native", { priceBase: { id: "native:ukrw", isLunc: false, isUstc: false } }),
      card("ibc", { priceBase: { id: "ibc:HASH", isLunc: false, isUstc: false } })
    ])).toEqual(["needed"])
  })

  it("keeps eligible contracts beyond the first and second visible pages", () => {
    const candidates = Array.from({ length: 81 }, (_, i) => card(`token${i}`, {
      priceUsd: i === 80 ? 1 : undefined
    }))
    expect(selectCw20MarketSupplyContracts(candidates)).toEqual(["token80"])
    expect(selectCw20MarketSupplyContracts([...candidates].reverse())).toEqual(["token80"])
  })

  it("preserves valuations and both global sort directions using fewer requested contracts", () => {
    // Snapshot of the CW20 valuation branch preceding this optimization. Supply
    // values stand in for already-decoded on-chain units, not guessed decimals.
    const value = (candidate: MarketSupplyCandidate, supplies: Record<string, number>) => {
      if (candidate.marketCapUsd !== undefined) return candidate.marketCapUsd
      if ((candidate.priceConfidenceUsd ?? 0) < 1000) return undefined
      if (candidate.priceUsd === undefined) return undefined
      const units = supplies[candidate.priceBase.id.slice(5).toLowerCase()]
      if (units === undefined) return undefined
      return guardChainRelativeValuation(units * candidate.priceUsd, 1_000_000_000)
    }
    const candidates = Array.from({ length: 121 }, (_, i) => card(`token${i}`, {
      priceUsd: i % 4 === 0 ? undefined : (i % 7) + 1,
      priceConfidenceUsd: i % 5 === 0 ? 999 : 1000,
      marketCapUsd: i % 6 === 0 ? 0 : undefined
    }))
    candidates[100] = card("token100", { priceUsd: 4 })
    const allSupplies = Object.fromEntries(candidates.map((item, i) => [
      item.priceBase.id.slice(5), i === 100 ? 1_000_000 : 1000 + i
    ]))
    const selected = selectCw20MarketSupplyContracts(candidates)
    expect(selected.length).toBeLessThan(candidates.length)
    expect(selected).toContain("token100")
    const neededSupplies = Object.fromEntries(selected.map((contract) => [contract, allSupplies[contract]]))
    expect(candidates.map((item) => value(item, neededSupplies)))
      .toEqual(candidates.map((item) => value(item, allSupplies)))

    const sorted = (supplies: Record<string, number>, direction: "asc" | "desc") =>
      [...candidates].sort((a, b) => {
        const av = value(a, supplies)
        const bv = value(b, supplies)
        if (av === undefined && bv === undefined) return 0
        if (av === undefined) return 1
        if (bv === undefined) return -1
        return direction === "asc" ? av - bv : bv - av
      }).map((item) => item.priceBase.id)
    for (const direction of ["asc", "desc"] as const) {
      expect(sorted(neededSupplies, direction)).toEqual(sorted(allSupplies, direction))
    }
    expect(sorted(neededSupplies, "desc")[0]).toBe("cw20:token100")
  })

  it("does not mutate the source list or cards", () => {
    const candidate = Object.freeze({ ...card("TOKEN"), priceBase: Object.freeze(card("TOKEN").priceBase) })
    const candidates = Object.freeze([candidate])
    expect(selectCw20MarketSupplyContracts(candidates)).toEqual(["token"])
    expect(candidate.priceBase.id).toBe("cw20:TOKEN")
    expect(selectCw20MarketSupplyContracts([])).toEqual([])
  })
})
