import { afterEach, describe, expect, it } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates,
  buildIbcAssetIconCandidates
} from "../src/app/utils/assetIcons"

describe("asset icon fallbacks", () => {
  afterEach(() => setActiveAppChainKey("lunc"))

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

  it("does not guess Luna native logos from symbols", () => {
    setActiveAppChainKey("luna")

    const candidates = buildClassicNativeIconCandidates({
      denom: "factory/terra1creator/ampROAR",
      symbol: "ampROAR"
    })

    expect(candidates[0]).toBe("/system/cw20.svg")
    expect(candidates.some((candidate) => candidate.startsWith("https://assets.terra.dev"))).toBe(
      false
    )
  })

  it("uses the Luna IBC system icon when no verified logo exists", () => {
    setActiveAppChainKey("luna")

    const candidates = buildIbcAssetIconCandidates([], "/system/ibc.svg", {
      symbol: "ATOM",
      baseDenom: "uatom"
    })

    expect(candidates[0]).toBe("/system/ibc.svg")
    expect(candidates.some((candidate) => candidate.startsWith("https://assets.terra.dev"))).toBe(
      false
    )
  })

  it("keeps an exact Luna registry logo ahead of the system fallback", () => {
    setActiveAppChainKey("luna")
    const logo =
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra2/images/ampCapa.svg"

    expect(
      buildClassicNativeIconCandidates({
        denom: "factory/terra1creator/ampCAPA",
        symbol: "ampCAPA",
        primaryIcon: logo
      }).slice(0, 2)
    ).toEqual([logo, "/system/cw20.svg"])
  })
})
