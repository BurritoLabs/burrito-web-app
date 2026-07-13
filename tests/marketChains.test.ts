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
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("terra1f4cr4sr5eulp3f2us8unu6qv8a5rhjltqsg7ujjx6f2mrlqh923sljwhn3")) {
        return new Response(JSON.stringify({
          data: {
            pairs: [
              {
                contract_addr: "terra1whitewhalepair",
                asset_infos: [
                  { native_token: { denom: "uluna" } },
                  { native_token: { denom: "ibc/WHITEWHALE" } }
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
    })
    vi.stubGlobal("fetch", fetchMock)

    const pairs = await fetchMarketDexPairs()

    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(pairs.map((pair) => pair.pair)).toEqual([
      "terra1lunapair",
      "terra1phoenixpair",
      "terra1whitewhalepair"
    ])
    expect(pairs.map((pair) => pair.dexId)).toEqual([
      "astroport",
      "phoenix",
      "white-whale"
    ])
    expect(pairs.some((pair) => pair.pair === "terra1classicpair")).toBe(false)
  })
})
