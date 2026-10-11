import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fetchCw20TokenInfos,
  fetchResolvedIbcMetadataBatch,
  includeTrustedCw20Tokens,
  isResolvedIbcMetadata,
  mapCosmosRegistryAssetAliases,
  mapCosmosRegistryAssets,
  mergeResolvedIbcAssets,
  pickChainAssets
} from "../src/app/data/terraAssets"
import { mapVerifiedRegistryAssets } from "../src/app/data/tokenRegistry"
import { getAssetProvenanceLabel } from "../src/app/utils/assetProvenance"

afterEach(() => vi.unstubAllGlobals())

describe("Terra asset registry selection", () => {
  const registry = {
    mainnet: { token: "luna" },
    classic: { token: "lunc" },
    testnet: { token: "test" }
  }

  it("labels verified CW20 bridge provenance without changing the symbol", () => {
    expect(
      getAssetProvenanceLabel({
        provenanceLabel: "Wormhole",
        transport: "cw20"
      })
    ).toBe("Wormhole CW20")
  })

  it("recovers CW20 bridge provenance from a verified on-chain name", () => {
    expect(
      getAssetProvenanceLabel({
        id: "cw20:terra1contract",
        name: "USD Coin (Wormhole)"
      })
    ).toBe("Wormhole CW20")
    expect(
      getAssetProvenanceLabel({
        denom: `ibc/${"A".repeat(64)}`,
        name: "USD Coin (Wormhole)"
      })
    ).toBe("Wormhole via IBC")
  })

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

  it("keeps Finder and successful IBC entries when one trace request fails, then retries that hash", async () => {
    const hashes = Array.from({ length: 9 }, (_, index) => String(index + 1).repeat(64))
    const failedHash = hashes[0]
    const finderToken = {
      denom: `ibc/${failedHash}`,
      base_denom: "finder-denom",
      symbol: "FINDER",
      name: "Finder Token",
      decimals: 6
    }
    const scope = {
      chainId: "columbus-5-ibc-test",
      chainKey: "lunc" as const,
      lcd: "https://terra-classic-lcd.publicnode.com",
      name: "Terra Classic"
    }
    const traceRequests: string[] = []
    let shouldFail = true
    let active = 0
    let maximumActive = 0
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString())
      if (url.pathname.includes("/ibc/apps/transfer/v1/denom_traces/")) {
        const hash = url.pathname.split("/").at(-1)!
        traceRequests.push(`${url.hostname}/${hash}`)
        active++
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 1))
        active--
        if (hash === failedHash && shouldFail) throw new Error("fixture LCD failure")
        return Response.json({ denom_trace: { base_denom: `denom-${hash.slice(0, 8)}` } })
      }
      if (url.pathname.includes("/cosmos/bank/v1beta1/denoms_metadata/")) {
        return Response.json({ metadata: {
          symbol: "TOK",
          name: "Verified Token",
          display: "tok",
          denom_units: [{ denom: "base", exponent: 0 }, { denom: "tok", exponent: 6 }]
        } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    const first = await fetchResolvedIbcMetadataBatch(hashes, { [failedHash]: finderToken }, scope)
    expect(maximumActive).toBeLessThanOrEqual(8)
    expect(first.failedHashes).toEqual([failedHash])
    expect(first.tokens[failedHash]).toEqual(finderToken)
    expect(first.tokens[hashes[1]]).toMatchObject({ symbol: "TOK", decimals: 6, decimalsVerified: true })

    shouldFail = false
    const attemptsBeforeRetry = traceRequests.filter((request) => request.endsWith(`/${failedHash}`)).length
    const retry = await fetchResolvedIbcMetadataBatch([failedHash], {}, scope)
    expect(retry.failedHashes).toEqual([])
    expect(retry.tokens[failedHash]).toMatchObject({ symbol: "TOK", decimals: 6, decimalsVerified: true })
    expect(traceRequests.filter((request) => request.endsWith(`/${failedHash}`)).length).toBeGreaterThan(attemptsBeforeRetry)
  })

  it("does not share same-URL CW20 metadata reads across different chains", async () => {
    const contract = "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0"
    const tokenInfoQuery = btoa(JSON.stringify({ token_info: {} }))
    const requests: string[] = []
    const releaseRequests: Array<() => void> = []
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requests.push(input.toString())
      const decimals = requests.length === 1 ? 8 : 6
      await new Promise<void>((resolve) => releaseRequests.push(resolve))
      return Response.json({ data: { name: "Chain Token", symbol: "CHAIN", decimals, total_supply: "100000000" } })
    }))
    const lcd = "https://terra-classic-lcd.publicnode.com"
    const fallback = { [contract]: { token: contract, symbol: "CHAIN", icon: "/system/cw20.svg" } }
    const first = fetchCw20TokenInfos([contract], fallback, {
      chainId: "same-url-chain-a", chainKey: "lunc", lcd, name: "Chain A"
    }, { skipFinder: true })
    const second = fetchCw20TokenInfos([contract], fallback, {
      chainId: "same-url-chain-b", chainKey: "lunc", lcd, name: "Chain B"
    }, { skipFinder: true })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests.filter((url) => url.includes(tokenInfoQuery))).toHaveLength(2)
    releaseRequests.forEach((release) => release())
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult[contract]).toMatchObject({ symbol: "CHAIN", decimals: 8, decimalsVerified: true })
    expect(secondResult[contract]).toMatchObject({ symbol: "CHAIN", decimals: 6, decimalsVerified: true })
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

  it("preserves verified IBC provenance from the Burrito registry", () => {
    const hash = "B".repeat(64)
    const registry = mapVerifiedRegistryAssets([
      {
        chainId: "columbus-5",
        type: "ibc",
        assetKey: `ibc/${hash}`,
        name: "USD Coin (Noble)",
        symbol: "USDC",
        decimals: 6,
        logoUrl: null,
        baseDenom: "uusdc",
        path: "transfer/channel-113",
        verificationStatus: "trace_verified",
        verificationMethod: "ibc_trace_hash",
        originChainId: "noble-1",
        originDenom: "uusdc",
        issuer: "Circle",
        transport: "ibc",
        provenanceLabel: "Noble",
        source: "cosmos_chain_registry",
        verifiedAt: 1,
        updatedAt: 1
      }
    ])

    expect(registry.ibc[hash]).toMatchObject({
      symbol: "USDC",
      name: "USD Coin (Noble)",
      path: "transfer/channel-113",
      verificationStatus: "trace_verified",
      originChainId: "noble-1",
      issuer: "Circle",
      provenanceLabel: "Noble"
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

  it("skips marketing_info when a sanitized fallback icon is already available", async () => {
    const contract = "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0"
    const fallbackIcon = "/tokens/registry.svg"
    const requests: string[] = []
    const tokenInfoQuery = btoa(JSON.stringify({ token_info: {} }))
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input.toString()
      requests.push(url)
      if (url.includes(tokenInfoQuery)) {
        return new Response(JSON.stringify({
          data: { name: "Registry Token", symbol: "REG", decimals: 8 }
        }))
      }
      throw new Error(`Unexpected CW20 metadata request: ${url}`)
    }))

    const tokens = await fetchCw20TokenInfos(
      [contract],
      {
        [contract]: {
          token: contract,
          symbol: "REG",
          name: "Registry Token",
          decimals: 8,
          icon: fallbackIcon
        }
      },
      {
        chainId: "columbus-5",
        chainKey: "lunc",
        lcd: "https://terra-classic-lcd.test",
        name: "Terra Classic"
      },
      { skipFinder: true }
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain(tokenInfoQuery)
    expect(requests[0]).not.toContain(btoa(JSON.stringify({ marketing_info: {} })))
    expect(tokens[contract]).toMatchObject({
      symbol: "REG",
      decimals: 8,
      decimalsVerified: true,
      icon: fallbackIcon
    })
  })

  it("loads a marketing icon when the fallback icon is absent or invalid", async () => {
    const contract = "terra1zs54uanqzwh2y4a6z9xlzawjyjp3tddd99ad0h58ghr5yh2fdfjq95gmcv"
    const requests: string[] = []
    const tokenInfoQuery = btoa(JSON.stringify({ token_info: {} }))
    const marketingQuery = btoa(JSON.stringify({ marketing_info: {} }))
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input.toString()
      requests.push(url)
      if (url.includes(tokenInfoQuery)) {
        return new Response(JSON.stringify({
          data: { name: "On-chain Token", symbol: "CHAIN", decimals: 6 }
        }))
      }
      if (url.includes(marketingQuery)) {
        return new Response(JSON.stringify({
          data: { logo: { url: "/tokens/on-chain.svg" } }
        }))
      }
      throw new Error(`Unexpected CW20 metadata request: ${url}`)
    }))

    const tokens = await fetchCw20TokenInfos(
      [contract],
      {
        [contract]: {
          token: contract,
          symbol: "CHAIN",
          icon: "javascript:alert(1)"
        }
      },
      {
        chainId: "columbus-5",
        chainKey: "lunc",
        lcd: "https://terra-classic-lcd.test",
        name: "Terra Classic"
      },
      { skipFinder: true }
    )

    expect(requests).toHaveLength(2)
    expect(requests.some((url) => url.includes(marketingQuery))).toBe(true)
    expect(tokens[contract]).toMatchObject({
      symbol: "CHAIN",
      decimals: 6,
      decimalsVerified: true,
      icon: "/tokens/on-chain.svg"
    })
  })

  it("keeps token_info metadata when marketing_info fails", async () => {
    const contract = "terra1ulgw0td86nvs4wtpsc80thv6xelk76ut7a7apj"
    const requests: string[] = []
    const tokenInfoQuery = btoa(JSON.stringify({ token_info: {} }))
    const marketingQuery = btoa(JSON.stringify({ marketing_info: {} }))
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input.toString()
      requests.push(url)
      if (url.includes(tokenInfoQuery)) {
        return new Response(JSON.stringify({
          data: { name: "No Logo Token", symbol: "NOLOGO", decimals: 6 }
        }))
      }
      if (url.includes(marketingQuery)) {
        return new Response("Unavailable", { status: 503 })
      }
      throw new Error(`Unexpected CW20 metadata request: ${url}`)
    }))

    const tokens = await fetchCw20TokenInfos(
      [contract],
      {},
      {
        chainId: "columbus-5",
        chainKey: "lunc",
        lcd: "https://terra-classic-lcd.test",
        name: "Terra Classic"
      },
      { skipFinder: true }
    )

    expect(requests).toHaveLength(2)
    expect(tokens[contract]).toMatchObject({
      symbol: "NOLOGO",
      decimals: 6,
      decimalsVerified: true
    })
    expect(tokens[contract].icon).toBeUndefined()
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
