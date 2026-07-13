import { afterEach, describe, expect, it, vi } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import { fetchMarketDexPairs } from "../src/app/data/market"

afterEach(() => {
  setActiveAppChainKey("lunc")
  vi.unstubAllGlobals()
})

describe("chain-specific market registry", () => {
  it("loads only Phoenix mainnet pairs on LUNA", async () => {
    setActiveAppChainKey("luna")
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        mainnet: {
          terra1lunapair: {
            dex: "astroport",
            type: "xyk",
            assets: ["uluna", "terra1lunatoken"]
          },
          terra1phoenixpair: {
            dex: "phoenix",
            type: "xyk",
            assets: ["uluna", "ibc/LUNAIBC"]
          }
        },
        classic: {
          terra1classicpair: {
            dex: "terraswap",
            type: "xyk",
            assets: ["uluna", "uusd"]
          }
        }
      }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    const pairs = await fetchMarketDexPairs()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pairs.map((pair) => pair.pair)).toEqual([
      "terra1lunapair",
      "terra1phoenixpair"
    ])
    expect(pairs.map((pair) => pair.dexId)).toEqual(["astroport", "phoenix"])
    expect(pairs.some((pair) => pair.pair === "terra1classicpair")).toBe(false)
  })
})
