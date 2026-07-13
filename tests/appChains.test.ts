import { afterEach, describe, expect, it } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import { APP_CHAINS } from "../src/app/appChains"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../src/app/chain"
import {
  getAddressExplorerUrl,
  getBlockExplorerUrl,
  getTxExplorerUrl,
  getValidatorExplorerUrl
} from "../src/app/explorer"

afterEach(() => setActiveAppChainKey("lunc"))

describe("app chain runtime", () => {
  it("defines Phoenix with the correct native denom and gas price", () => {
    expect(APP_CHAINS.luna.chainId).toBe("phoenix-1")
    expect(APP_CHAINS.luna.runtime.nativeDenom.coinDenom).toBe("LUNA")
    expect(APP_CHAINS.luna.runtime.gasPriceStep.average).toBe(0.015)
  })

  it("uses the same chain accents as Burrito AI and Monitor", () => {
    expect(APP_CHAINS.lunc.accent).toBe("#38bdf8")
    expect(APP_CHAINS.luna.accent).toBe("#f97316")
  })

  it("switches compatibility reads to the active chain", () => {
    setActiveAppChainKey("luna")
    expect(CLASSIC_CHAIN.chainId).toBe("phoenix-1")
    expect(CLASSIC_DENOMS.lunc.coinDenom).toBe("LUNA")
  })

  it("keeps unconfigured Phoenix contract features disabled", () => {
    expect(APP_CHAINS.luna.features).toEqual({
      swap: false,
      market: true,
      launchpad: false
    })
  })
})

describe("chain explorers", () => {
  it("uses Burrito Finder for Terra Classic", () => {
    expect(getTxExplorerUrl("lunc", "ABC")).toContain("/classic/tx/ABC")
    expect(getAddressExplorerUrl("lunc", "terra1abc")).toContain(
      "/classic/address/terra1abc"
    )
  })

  it("uses Burrito Finder mainnet routes for Phoenix", () => {
    expect(getTxExplorerUrl("luna", "ABC")).toBe(
      "https://finder.burrito.money/mainnet/tx/ABC"
    )
    expect(getAddressExplorerUrl("luna", "terra1abc")).toBe(
      "https://finder.burrito.money/mainnet/address/terra1abc"
    )
    expect(getBlockExplorerUrl("luna", 123)).toBe(
      "https://finder.burrito.money/mainnet/blocks/123"
    )
    expect(getValidatorExplorerUrl("luna", "terravaloper1abc")).toBe(
      "https://finder.burrito.money/mainnet/validator/terravaloper1abc"
    )
  })
})
