import { describe, expect, it } from "vitest"
import { calculatePairPriceChange } from "../src/app/market/priceChange"

describe("pair percentage changes", () => {
  it("does not invent a missing asset's return from the other side", () => {
    expect(calculatePairPriceChange(undefined, -2)).toBeUndefined()
    expect(calculatePairPriceChange(2, undefined)).toBeUndefined()
    expect(calculatePairPriceChange(undefined, undefined)).toBeUndefined()
  })

  it("calculates relative returns only when both sides are known", () => {
    expect(calculatePairPriceChange(10, 5)).toBeCloseTo((1.1 / 1.05 - 1) * 100)
    expect(calculatePairPriceChange(0, 10)).toBeCloseTo((1 / 1.1 - 1) * 100)
    expect(calculatePairPriceChange(10, 0)).toBeCloseTo(10)
  })

  it("rejects impossible or non-finite inputs instead of rendering infinity", () => {
    expect(calculatePairPriceChange(2, -100)).toBeUndefined()
    expect(calculatePairPriceChange(-101, 2)).toBeUndefined()
    expect(calculatePairPriceChange(NaN, 2)).toBeUndefined()
    expect(calculatePairPriceChange(2, Infinity)).toBeUndefined()
  })
})
