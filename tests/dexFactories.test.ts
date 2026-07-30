import { describe, expect, it } from "vitest"
import { CLASSIC_SWAP_DEXES } from "../src/app/data/dexFactories"

describe("Classic DEX discovery coverage", () => {
  it("includes both generations of Garuda V2 pair contracts", () => {
    const garudaV2 = CLASSIC_SWAP_DEXES.find((dex) => dex.id === "garuda-v2")

    expect(garudaV2?.pairCodeIds).toEqual(
      expect.arrayContaining([10902, 10907])
    )
  })
})
