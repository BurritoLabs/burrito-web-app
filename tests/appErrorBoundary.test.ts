import { describe, expect, it } from "vitest"
import { getStaleAssetRecoveryDelay } from "../src/app/feedback/appRecovery"

describe("stale asset recovery", () => {
  it("backs off across bounded deployment recovery attempts", () => {
    expect([0, 1, 2, 3, 4].map(getStaleAssetRecoveryDelay)).toEqual([
      2_000,
      5_000,
      10_000,
      20_000,
      20_000
    ])
  })
})
