import { describe, expect, it } from "vitest"
import { buildChainScopedAssetCacheKey } from "../src/app/data/terraAssets"
import { findAlternativeChainForFeature } from "../src/app/routes/chainFeatureAvailability"
import { getChainSwitchDestination } from "../src/app/routes/chainSwitchNavigation"
import { getHiddenTokensStorageKey } from "../src/app/wallet/useWalletVisibilityPreferences"

describe("dual-chain state isolation", () => {
  it("scopes matching asset ids and wallet preferences by chain", () => {
    expect(buildChainScopedAssetCacheKey("columbus-5", "uluna")).not.toBe(
      buildChainScopedAssetCacheKey("phoenix-1", "uluna")
    )
    expect(getHiddenTokensStorageKey("columbus-5")).not.toBe(
      getHiddenTokensStorageKey("phoenix-1")
    )
  })

  it("leaves chain-neutral routes unchanged", () => {
    expect(
      getChainSwitchDestination({ pathname: "/stake", search: "" })
    ).toBeUndefined()
  })

  it("drops stale market pair and swap asset state during a chain switch", () => {
    expect(
      getChainSwitchDestination({
        pathname: "/market/pair/terraswap/terra1pair",
        search: "?from=launchpad"
      })
    ).toBe("/market")
    expect(
      getChainSwitchDestination({
        pathname: "/swap",
        search: "?from=cw20%3Aterra1token&to=native%3Auluna&utm=wallet"
      })
    ).toBe("/swap?utm=wallet")
  })

  it("keeps the launchpad tab but removes a chain-specific launch id", () => {
    expect(
      getChainSwitchDestination({
        pathname: "/launchpad",
        search: "?tab=explore&launch=registry-42"
      })
    ).toBe("/launchpad?tab=explore")
  })

  it("finds the other enabled chain instead of assuming Classic", () => {
    const chains = [
      {
        key: "lunc" as const,
        name: "Terra Classic",
        features: { swap: false, market: false, launchpad: false }
      },
      {
        key: "luna" as const,
        name: "Terra",
        features: { swap: true, market: true, launchpad: true }
      }
    ]

    expect(findAlternativeChainForFeature(chains, "lunc", "market")?.key).toBe(
      "luna"
    )
    expect(
      findAlternativeChainForFeature(chains, "luna", "market")
    ).toBeUndefined()
  })
})
