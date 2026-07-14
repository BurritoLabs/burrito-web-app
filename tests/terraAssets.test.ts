import { describe, expect, it } from "vitest"
import {
  mapCosmosRegistryAssetAliases,
  mapCosmosRegistryAssets,
  pickChainAssets
} from "../src/app/data/terraAssets"

describe("Terra asset registry selection", () => {
  const registry = {
    mainnet: { token: "luna" },
    classic: { token: "lunc" },
    testnet: { token: "test" }
  }

  it("selects the Phoenix mainnet registry", () => {
    expect(pickChainAssets(registry, "Terra", "phoenix-1")).toEqual({
      token: "luna"
    })
  })

  it("selects the Terra Classic registry", () => {
    expect(pickChainAssets(registry, "Terra Classic", "columbus-5")).toEqual({
      token: "lunc"
    })
  })

  it("prefers an exact chain id key when one exists", () => {
    expect(
      pickChainAssets(
        { ...registry, "phoenix-1": { token: "exact" } },
        "Terra",
        "phoenix-1"
      )
    ).toEqual({ token: "exact" })
  })

  it("maps Phoenix IBC and token-factory metadata by denom", () => {
    const mapped = mapCosmosRegistryAssets({
      assets: [
        {
          base: `ibc/${"A".repeat(64)}`,
          display: "usdc",
          symbol: "USDC",
          name: "USDC",
          denom_units: [
            { denom: `ibc/${"A".repeat(64)}`, exponent: 0 },
            { denom: "usdc", exponent: 6 }
          ],
          traces: [
            {
              chain: { channel_id: "channel-253" },
              counterparty: { base_denom: "uusdc" }
            }
          ]
        },
        {
          base: "factory/terra1creator/ampROAR",
          display: "ampROAR",
          symbol: "ampROAR",
          name: "ERIS Amplified ROAR",
          denom_units: [
            { denom: "factory/terra1creator/ampROAR", exponent: 0 },
            { denom: "ampROAR", exponent: 6 }
          ]
        }
      ]
    })

    expect(mapped.ibc["A".repeat(64)]).toMatchObject({
      symbol: "USDC",
      name: "USDC",
      base_denom: "uusdc",
      decimals: 6
    })
    expect(mapped.native["factory/terra1creator/amproar"]).toMatchObject({
      symbol: "ampROAR",
      name: "ERIS Amplified ROAR",
      decimals: 6
    })
  })

  it("indexes source-chain aliases used by unresolved Phoenix IBC denoms", () => {
    const aliases = mapCosmosRegistryAssetAliases([
      {
        assets: [
          {
            base: "wbtc-satoshi",
            display: "wbtc",
            symbol: "WBTC",
            name: "Wrapped Bitcoin",
            denom_units: [
              { denom: "wbtc-satoshi", exponent: 0 },
              { denom: "wbtc", exponent: 8 }
            ],
            traces: [
              {
                counterparty: {
                  base_denom: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
                }
              }
            ]
          }
        ]
      }
    ])

    expect(aliases["0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"]).toMatchObject({
      symbol: "WBTC",
      name: "Wrapped Bitcoin",
      decimals: 8
    })
  })
})
