import { describe, expect, it } from "vitest"
import {
  getFactoryPairCursor,
  parseFactoryPairRecord
} from "../src/app/market/factoryPairs"

const dex = { id: "white-whale", label: "White Whale" }

describe("parseFactoryPairRecord", () => {
  it("parses White Whale native and CW20 pairs", () => {
    const pair = parseFactoryPairRecord(
      {
        contract_addr: "terra1PAIR",
        asset_infos: [
          { native_token: { denom: "uluna" } },
          { token: { contract_addr: "terra1TOKEN" } }
        ],
        pair_type: "constant_product"
      },
      dex
    )

    expect(pair).toEqual({
      pair: "terra1pair",
      dexId: "white-whale",
      dexLabel: "White Whale",
      type: "xyk",
      assets: ["uluna", "terra1token"]
    })
  })

  it("marks stable-swap pools and preserves the pagination cursor", () => {
    const assetInfos = [
      { native_token: { denom: "ibc/AAA" } },
      { native_token: { denom: "ibc/BBB" } }
    ]
    const pair = parseFactoryPairRecord(
      {
        contract_addr: "terra1stable",
        asset_infos: assetInfos,
        pair_type: { stable_swap: { amp: 85 } }
      },
      dex
    )

    expect(pair?.type).toBe("stable")
    expect(getFactoryPairCursor({ asset_infos: assetInfos })).toEqual(assetInfos)
  })

  it("rejects incomplete factory records", () => {
    expect(
      parseFactoryPairRecord(
        {
          contract_addr: "terra1missing",
          asset_infos: [{ native_token: { denom: "uluna" } }]
        },
        dex
      )
    ).toBeUndefined()
  })
})
