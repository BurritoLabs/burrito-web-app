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
    const lunaPair = `terra1${"q".repeat(38)}`
    const phoenixPair = `terra1${"r".repeat(38)}`
    const whiteWhalePair = `terra1${"s".repeat(38)}`
    const classicPair = `terra1${"t".repeat(38)}`
    const lunaToken = `terra1${"p".repeat(38)}`
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("terra1f4cr4sr5eulp3f2us8unu6qv8a5rhjltqsg7ujjx6f2mrlqh923sljwhn3")) {
        return new Response(JSON.stringify({
          data: {
            pairs: [
              {
                contract_addr: whiteWhalePair,
                asset_infos: [
                  { native_token: { denom: "uluna" } },
                  { native_token: { denom: `ibc/${"A".repeat(64)}` } }
                ],
                pair_type: "constant_product"
              }
            ]
          }
        }), { status: 200 })
      }
      if (url.includes("/cosmwasm/wasm/v1/contract/")) {
        return new Response(JSON.stringify({ data: { pairs: [] } }), {
          status: 200
        })
      }
      return new Response(JSON.stringify({
          mainnet: {
            [lunaPair]: {
              dex: "astroport",
              type: "xyk",
              assets: ["uluna", lunaToken]
            },
            [phoenixPair]: {
              dex: "phoenix",
              type: "xyk",
              assets: ["uluna", `ibc/${"B".repeat(64)}`]
            }
          },
          classic: {
            [classicPair]: {
              dex: "terraswap",
              type: "xyk",
              assets: ["uluna", "uusd"]
            }
          }
        }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const pairs = await fetchMarketDexPairs()

    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(pairs.map((pair) => pair.pair)).toEqual([
      lunaPair,
      phoenixPair,
      whiteWhalePair
    ])
    expect(pairs.map((pair) => pair.dexId)).toEqual([
      "astroport",
      "phoenix",
      "white-whale"
    ])
    expect(pairs.some((pair) => pair.pair === classicPair)).toBe(false)
  })
})
