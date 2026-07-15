import { describe, expect, it } from "vitest"
import {
  buildCw20IconCandidates,
  buildIbcAssetIconCandidates
} from "../src/app/utils/assetIcons"

describe("asset icon fallbacks", () => {
  it("uses the CW20 system icon when a CW20 has no published logo", () => {
    const candidates = buildCw20IconCandidates(undefined, "JURIS")

    expect(candidates[0]).toBe("/system/cw20.svg")
    expect(candidates.at(-1)).toMatch(/^data:image\/svg\+xml/)
  })

  it("keeps a verified CW20 logo ahead of the CW20 system icon", () => {
    const logo = "https://assets.terra.dev/icon/60/JURIS.png"
    const candidates = buildCw20IconCandidates(logo, "JURIS")

    expect(candidates.slice(0, 2)).toEqual([logo, "/system/cw20.svg"])
  })

  it("uses the IBC system icon before any generated emergency fallback", () => {
    const candidates = buildIbcAssetIconCandidates([], "/system/ibc.svg", {
      symbol: "ATOM"
    })
    const systemIndex = candidates.indexOf("/system/ibc.svg")
    const generatedIndex = candidates.findIndex((candidate) =>
      candidate.startsWith("data:image/svg+xml")
    )

    expect(systemIndex).toBeGreaterThanOrEqual(0)
    expect(generatedIndex).toBeGreaterThan(systemIndex)
  })
})
