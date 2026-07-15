import { describe, expect, it } from "vitest"
import {
  getFactoryPairCursor,
  parseFactoryPairRecord
} from "../src/app/market/factoryPairs"

const dex = { id: "white-whale", label: "White Whale" }
const pairAddress = `terra1${"q".repeat(38)}`
const tokenAddress = `terra1${"p".repeat(38)}`

describe("parseFactoryPairRecord", () => {
  it("parses White Whale native and CW20 pairs", () => {
    const pair = parseFactoryPairRecord(
      {
        contract_addr: pairAddress,
        asset_infos: [
          { native_token: { denom: "uluna" } },
          { token: { contract_addr: tokenAddress } }
        ],
        pair_type: "constant_product"
      },
      dex
    )

    expect(pair).toEqual({
      pair: pairAddress,
      dexId: "white-whale",
      dexLabel: "White Whale",
      type: "xyk",
      assets: ["uluna", tokenAddress]
    })
  })

  it("marks stable-swap pools and preserves the pagination cursor", () => {
    const assetInfos = [
      { native_token: { denom: `ibc/${"A".repeat(64)}` } },
      { native_token: { denom: `ibc/${"B".repeat(64)}` } }
    ]
    const pair = parseFactoryPairRecord(
      {
        contract_addr: pairAddress,
        asset_infos: assetInfos,
        pair_type: { stable_swap: { amp: 85 } }
      },
      dex
    )

    expect(pair?.type).toBe("stable")
    expect(getFactoryPairCursor({ asset_infos: assetInfos })).toEqual(assetInfos)
  })

  it("preserves Astroport concentrated pool types", () => {
    const pair = parseFactoryPairRecord(
      {
        contract_addr: pairAddress,
        asset_infos: [
          { native_token: { denom: "uluna" } },
          { token: { contract_addr: tokenAddress } }
        ],
        pair_type: { custom: "concentrated" }
      },
      dex
    )

    expect(pair?.type).toBe("concentrated")
  })

  it("rejects incomplete factory records", () => {
    expect(
      parseFactoryPairRecord(
        {
          contract_addr: pairAddress,
          asset_infos: [{ native_token: { denom: "uluna" } }]
        },
        dex
      )
    ).toBeUndefined()
  })
})
