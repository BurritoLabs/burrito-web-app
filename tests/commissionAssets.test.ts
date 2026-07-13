import { describe, expect, it } from "vitest"
import {
  buildCommissionIconCandidates,
  getCommissionSymbol
} from "../src/pages/stake/commissionAssets"

describe("validator commission assets", () => {
  it("uses the Phoenix LUNA symbol and logo", () => {
    expect(getCommissionSymbol("uluna", "luna")).toBe("LUNA")
    expect(buildCommissionIconCandidates("uluna", "luna")[0]).toBe(
      "/system/luna.svg"
    )
  })

  it("keeps the Terra Classic LUNC symbol and logo", () => {
    expect(getCommissionSymbol("uluna", "lunc")).toBe("LUNC")
    expect(buildCommissionIconCandidates("uluna", "lunc")[0]).toBe(
      "/system/lunc.svg"
    )
  })
})
