import { describe, expect, it } from "vitest"
import {
  buildSwapRouteCandidates,
  normalizeDexFamily,
  type SwapRoutePair
} from "../src/app/swap/routeCandidates"

const pairs: SwapRoutePair[] = [
  {
    pair: "terra1direct",
    dexId: "astroport",
    dexLabel: "Astroport",
    assets: ["token-a", "token-b"]
  },
  {
    pair: "terra1aluna",
    dexId: "astroport",
    dexLabel: "Astroport",
    assets: ["token-a", "uluna"]
  },
  {
    pair: "terra1lunab",
    dexId: "terraswap",
    dexLabel: "Terraswap",
    assets: ["uluna", "token-b"]
  },
  {
    pair: "terra1ausdc",
    dexId: "phoenix",
    dexLabel: "Phoenix",
    assets: ["token-a", "ibc/usdc"]
  },
  {
    pair: "terra1usdcb",
    dexId: "phoenix",
    dexLabel: "Phoenix",
    assets: ["ibc/usdc", "token-b"]
  },
  {
    pair: "terra1unsupported",
    dexId: "unknown",
    dexLabel: "Unknown",
    assets: ["token-a", "token-b"]
  }
]

describe("buildSwapRouteCandidates", () => {
  it("keeps every supported direct pool", () => {
    const routes = buildSwapRouteCandidates({
      activeDexIds: new Set(["astroport", "terraswap", "phoenix"]),
      offerAssetKey: "token-a",
      askAssetKey: "token-b",
      pairs,
      maxTwoHopRoutes: 0
    })

    expect(routes.map((route) => route.id)).toEqual([
      "astroport:terra1direct"
    ])
  })

  it("deduplicates repeated registry entries for the same pool", () => {
    const routes = buildSwapRouteCandidates({
      activeDexIds: new Set(["astroport"]),
      offerAssetKey: "token-a",
      askAssetKey: "token-b",
      pairs: [pairs[0], pairs[0]],
      maxTwoHopRoutes: 0
    })

    expect(routes).toHaveLength(1)
  })

  it("prioritizes LUNA and same-DEX bridge routes", () => {
    const routes = buildSwapRouteCandidates({
      activeDexIds: new Set(["astroport", "terraswap", "phoenix"]),
      offerAssetKey: "TOKEN-A",
      askAssetKey: "TOKEN-B",
      pairs
    })

    expect(routes[1]?.bridgeAssetKey).toBe("uluna")
    expect(routes.some((route) => route.bridgeAssetKey === "ibc/usdc")).toBe(true)
    expect(routes.every((route) => !route.id.includes("unknown"))).toBe(true)
  })

  it("caps two-hop work without removing direct routes", () => {
    const routes = buildSwapRouteCandidates({
      activeDexIds: new Set(["astroport", "terraswap", "phoenix"]),
      offerAssetKey: "token-a",
      askAssetKey: "token-b",
      pairs,
      maxTwoHopRoutes: 1
    })

    expect(routes).toHaveLength(2)
    expect(routes[0]?.hops).toHaveLength(1)
    expect(routes[1]?.hops).toHaveLength(2)
  })
})

describe("normalizeDexFamily", () => {
  it("normalizes versioned protocol ids", () => {
    expect(normalizeDexFamily("Terraswap-Legacy")).toBe("terraswap")
  })
})
