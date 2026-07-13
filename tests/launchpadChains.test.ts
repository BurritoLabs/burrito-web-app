import { afterEach, describe, expect, it } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import {
  getLaunchpadConfig,
  getLaunchpadCreationFeeLabel,
  getLaunchpadStorageKeys
} from "../src/app/config/launchpadConfig"
import { getSwapDexes } from "../src/app/data/dexFactories"
import { buildCw20InstantiateMessage } from "../src/app/launchpad/cw20"
import {
  buildLuncPairAssetInfos,
  getTerraswapFactoryAddress
} from "../src/app/launchpad/pool"

afterEach(() => setActiveAppChainKey("lunc"))

const tokenInput = {
  creatorAddress: "terra1creator",
  name: "Burrito Test",
  symbol: "BTEST",
  supply: "1000000",
  decimals: 6
}

describe("chain-specific DEX configuration", () => {
  it("uses the four active Phoenix factory DEXes", () => {
    expect(getSwapDexes("luna").map((dex) => dex.id)).toEqual([
      "astroport",
      "terraswap",
      "phoenix",
      "white-whale"
    ])
    expect(getSwapDexes("luna").every((dex) => dex.factory?.startsWith("terra1"))).toBe(true)
  })
})

describe("chain-specific launchpad configuration", () => {
  it("keeps Classic and Phoenix browser storage isolated", () => {
    expect(getLaunchpadStorageKeys("lunc")).not.toEqual(
      getLaunchpadStorageKeys("luna")
    )
  })

  it("uses Phoenix CW20 code id, creation fee, and Terraswap factory", () => {
    setActiveAppChainKey("luna")
    const config = getLaunchpadConfig()
    const message = buildCw20InstantiateMessage(tokenInput, "BTEST")

    expect(config.chainId).toBe("phoenix-1")
    expect(config.nativeSymbol).toBe("LUNA")
    expect(config.cw20CodeId).toBe(4n)
    expect(message.value.codeId).toBe(4n)
    expect(getLaunchpadCreationFeeLabel()).toBe("1 LUNA")
    expect(getTerraswapFactoryAddress()).toBe(
      "terra1466nf3zuxpya8q9emxukd7vftaf6h4psr0a07srl5zw74zh84yjqxl5qul"
    )
    expect(buildLuncPairAssetInfos("terra1token")[1]).toEqual({
      native_token: { denom: "uluna" }
    })
  })

  it("retains the Classic launchpad configuration", () => {
    const config = getLaunchpadConfig("lunc")
    expect(config.chainId).toBe("columbus-5")
    expect(config.cw20CodeId).toBe(3n)
    expect(config.nativeSymbol).toBe("LUNC")
    expect(getLaunchpadCreationFeeLabel("lunc")).toBe("30,000 LUNC")
  })
})
