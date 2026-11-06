import { describe, expect, it } from "vitest"
import { deriveUsdPriceGraphFromPools } from "../src/app/market/priceGraph"
import { hasMarketCw20Precision, resolveCw20ReservePrice, resolveCw20ReserveValuation } from "../src/app/market/cw20Pricing"
import type { MarketPoolSnapshot } from "../src/app/data/market"

const target = "cw20:terra1target"
const intermediary = "cw20:terra1quote"
const pool = (left: string, amountLeft: string, right: string, amountRight: string): MarketPoolSnapshot => ({
  pair: `${left}-${right}`, dexId: "test", dexLabel: "Test", type: "xyk",
  poolAssets: [{ id: left, amount: amountLeft }, { id: right, amount: amountRight }]
})
const supply = { totalSupply: "1000000000", decimals: 8, units: 10 }

describe("CW20 reserve price units", () => {
  it("converts the actual raw-reserve fixture to explicit on-chain eight-decimal units", () => {
    const graph = deriveUsdPriceGraphFromPools({
      pools: [pool(target, "352270740168", "native:uusd", "15556051772276")],
      getDecimals: () => 6,
      getSeedUsdPrice: (_id, key) => key === "uusd" ? 0.005 : undefined
    })
    const price = graph.terra1target.price
    const expected = (15556051772276 / 1e6 * 0.005) / (352270740168 / 1e8)
    expect(price).not.toBeCloseTo(expected, 4)
    expect(resolveCw20ReservePrice(price, 6, supply)).toBeCloseTo(expected, 10)
    expect(resolveCw20ReserveValuation(price, 6, supply)).toBeCloseTo(expected * 10, 10)
  })

  it.each([0, 6, 8, 18])("keeps multihop prices and liquidity invariant under intermediate precision %i", (quoteDecimals) => {
    const pools = [pool("native:uusd", "2000000000", intermediary, "400000000000"),
      pool(intermediary, "200000000000", target, "5000000000")]
    const graph = (targetDecimals: number) => deriveUsdPriceGraphFromPools({
      pools, getDecimals: id => id === intermediary ? quoteDecimals : id === target ? targetDecimals : 6,
      getSeedUsdPrice: (_id, key) => key === "uusd" ? 0.005 : undefined
    })
    const baseline = graph(6)
    const actual = graph(8)
    expect(resolveCw20ReservePrice(baseline.terra1target.price, 6, supply)).toBeCloseTo(actual.terra1target.price, 12)
    expect(baseline.terra1target.liquidity).toBeCloseTo(actual.terra1target.liquidity, 12)
    expect(resolveCw20ReserveValuation(baseline.terra1target.price, 6, supply)).toBeCloseTo(1, 12)
  })

  it("preserves matched units, zero supply and zero price", () => {
    expect(resolveCw20ReservePrice(22, 8, supply)).toBe(22)
    expect(resolveCw20ReserveValuation(22, 8, { ...supply, units: 0, totalSupply: "0" })).toBe(0)
    expect(resolveCw20ReserveValuation(0, 6, supply)).toBe(0)
    expect(resolveCw20ReservePrice(1, 6, { totalSupply: "12", units: 12, decimals: 0 })).toBe(0.000001)
  })

  it.each([undefined, NaN, Infinity, -1])("rejects absent/invalid price %s", price => {
    expect(resolveCw20ReservePrice(price, 6, supply)).toBeUndefined()
  })

  it.each([-1, 1.5, 256, NaN, Infinity])("rejects an invalid normalization basis %s", decimals => {
    expect(resolveCw20ReservePrice(1, decimals, supply)).toBeUndefined()
  })

  it("does not invent precision, display infinite estimates or mutate source data", () => {
    expect(resolveCw20ReservePrice(1, 6, undefined)).toBeUndefined()
    expect(resolveCw20ReservePrice(Number.MAX_VALUE, 6, supply)).toBeUndefined()
    expect(resolveCw20ReservePrice(Number.MIN_VALUE, 255, { ...supply, decimals: 0 })).toBeUndefined()
    expect(resolveCw20ReserveValuation(Number.MAX_VALUE, 8, supply)).toBeUndefined()
    const frozen = Object.freeze({ ...supply })
    resolveCw20ReserveValuation(1, 6, frozen)
    expect(frozen).toEqual(supply)
  })

  it("requires both sides of a CW20 pair, preserves zero decimals and needs no CW20 reads for native pairs", () => {
    expect(hasMarketCw20Precision([], {})).toBe(true)
    expect(hasMarketCw20Precision(["base", "quote"], { base: supply })).toBe(false)
    expect(hasMarketCw20Precision(["base", "quote"], { base: supply, quote: { ...supply, decimals: 0 } })).toBe(true)
    expect(hasMarketCw20Precision(["different-chain-token"], { base: supply })).toBe(false)
  })
})
