import { describe, expect, it } from "vitest"
import { resolveSendTaxMode } from "../src/app/wallet/sendTaxStatus"

const ready = {
  isClassic: true, kind: "native" as const, hasAccount: true, recipientIsValid: true,
  rate: 0.015, rateError: false, taxable: true, taxableError: false, taxableFetching: false,
  amount: 1000000n, computedAmount: "15000", computedError: false, computedFetching: false
}

describe("send tax readiness", () => {
  it("uses confirmed chain data, not a hardcoded rate", () => {
    expect(resolveSendTaxMode(ready)).toBe("taxed")
    expect(resolveSendTaxMode({ ...ready, rate: 0.025 })).toBe("taxed")
    expect(resolveSendTaxMode({ ...ready, rate: 0, computedAmount: "0" })).toBe("no-tax")
    expect(resolveSendTaxMode({ ...ready, taxable: false, computedAmount: "0" })).toBe("exempt")
  })
  it.each(["rateError", "taxableError", "computedError"] as const)("blocks on %s even with stale successful data", key => {
    expect(resolveSendTaxMode({ ...ready, [key]: true })).toBe("error")
  })
  it("keeps unavailable data pending instead of inventing zero tax", () => {
    expect(resolveSendTaxMode({ ...ready, rate: undefined })).toBe("pending")
    expect(resolveSendTaxMode({ ...ready, taxable: undefined })).toBe("pending")
    expect(resolveSendTaxMode({ ...ready, computedAmount: undefined })).toBe("pending")
  })
  it("does not approve stale tax results while the route or amount is being rechecked", () => {
    expect(resolveSendTaxMode({ ...ready, taxableFetching: true })).toBe("pending")
    expect(resolveSendTaxMode({ ...ready, computedFetching: true })).toBe("pending")
  })
  it.each(["", "-1", "NaN", "1e3"])("rejects malformed computed amount %s", computedAmount => {
    expect(resolveSendTaxMode({ ...ready, computedAmount })).toBe("error")
  })
  it("does not apply Classic bank tax readiness to Terra or CW20 routes", () => {
    expect(resolveSendTaxMode({ ...ready, isClassic: false, rate: undefined, rateError: true })).toBe("no-tax")
    expect(resolveSendTaxMode({ ...ready, kind: "cw20", rate: undefined, rateError: true })).toBe("cw20")
    expect(resolveSendTaxMode({ ...ready, kind: "ibc", rateError: true })).toBe("error")
  })
})
