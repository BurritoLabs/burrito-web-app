import { describe, expect, it } from "vitest"
import { guardChainRelativeValuation } from "../src/app/market/valuationGuard"

describe("chain-relative market valuation guard", () => {
  it("rejects values that exceed the network by an implausible amount", () => {
    expect(guardChainRelativeValuation(43_000_000_000, 35_000_000)).toBeUndefined()
    expect(guardChainRelativeValuation(1_100_000, 35_000_000)).toBe(1_100_000)
  })

  it("retains finite values when network market cap is unavailable", () => {
    expect(guardChainRelativeValuation(250_000, undefined)).toBe(250_000)
  })
})
