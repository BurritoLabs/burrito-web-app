import { describe, expect, it } from "vitest"
import {
  fetchCw20TokenInfos,
  includeTrustedCw20Tokens,
  isResolvedIbcMetadata,
  mapCosmosRegistryAssetAliases,
  mapCosmosRegistryAssets,
  mergeResolvedIbcAssets,
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

  it("rejects generic Finder IBC placeholders as resolved metadata", () => {
    expect(isResolvedIbcMetadata({ symbol: "IBC", name: "IBC" })).toBe(false)
    expect(isResolvedIbcMetadata({ symbol: "WBTC", name: "Wrapped Bitcoin" })).toBe(true)
  })

  it("preserves the exact chain registry logo during IBC resolution", () => {
    const hash = "A".repeat(64)
    const registryLogo =
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/injective/images/inj.svg"

    const merged = mergeResolvedIbcAssets(
      {
        [hash]: {
          denom: `ibc/${hash}`,
          base_denom: "inj",
          symbol: "INJ",
          name: "Injective",
          icon: registryLogo
        }
      },
      {
        [hash]: {
          denom: `ibc/${hash}`,
          base_denom: "inj",
          symbol: "INJ",
          name: "Injective",
          icon: "/system/ibc.svg",
          decimals: 18,
          decimalsVerified: true
        }
      }
    )

    expect(merged[hash]).toMatchObject({
      icon: registryLogo,
      decimals: 18,
      decimalsVerified: true
    })
  })

  it("uses the verified JURIS logo for its Terra Classic contract", async () => {
    const contract =
      "terra1vhgq25vwuhdhn9xjll0rhl2s67jzw78a4g2t78y5kz89q9lsdskq2pxcj2"
    const tokens = await fetchCw20TokenInfos(
      [contract],
      {
        [contract]: {
          token: contract,
          symbol: "JURIS",
          name: "Juris Protocol",
          icon: "/system/cw20.svg"
        }
      },
      {
        chainId: "columbus-5",
        chainKey: "lunc",
        lcd: "https://terra-classic-lcd.publicnode.com",
        name: "Terra Classic"
      }
    )

    expect(tokens[contract]).toMatchObject({
      symbol: "JURIS",
      name: "Juris Protocol",
      icon: "/tokens/juris.webp"
    })
  })

  it("includes trusted Terra Classic CW20s in wallet discovery", () => {
    const contract =
      "terra15p8su45k45axng8ue59rl6zph4at27s49u3agr6uqrx3dhcxpg3qt0ekdt"

    expect(includeTrustedCw20Tokens({}, "lunc")[contract]).toMatchObject({
      token: contract,
      symbol: "DO",
      name: "DO",
      icon: "/system/do-cookie.jpg"
    })
  })

  it("does not inject Terra Classic CW20s on Luna", () => {
    expect(includeTrustedCw20Tokens({}, "luna")).toEqual({})
  })

  it("preserves registry decimals for trusted CW20s", () => {
    const contract =
      "terra15p8su45k45axng8ue59rl6zph4at27s49u3agr6uqrx3dhcxpg3qt0ekdt"
    const tokens = includeTrustedCw20Tokens(
      {
        [contract]: {
          token: contract,
          symbol: "COOKIE",
          decimals: 8
        }
      },
      "lunc"
    )

    expect(tokens[contract]).toMatchObject({
      symbol: "DO",
      decimals: 8
    })
  })
})
