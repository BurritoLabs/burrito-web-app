import { describe, expect, it } from "vitest"
import { CLASSIC_DENOMS } from "../src/app/chain"
import {
  getWalletSwapAssetId,
  getWalletSwapCounterAssetId,
  getWalletSwapPath
} from "../src/app/wallet/swapNavigation"

describe("wallet swap navigation", () => {
  it("routes LUNC to USTC", () => {
    const asset = {
      denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
      kind: "native"
    }

    expect(getWalletSwapAssetId(asset)).toBe("native:uluna")
    expect(getWalletSwapCounterAssetId(asset)).toBe("native:uusd")
    expect(getWalletSwapPath(asset)).toBe("/swap?from=native%3Auluna&to=native%3Auusd")
  })

  it("routes USTC to LUNC instead of leaving the default target duplicated", () => {
    const asset = {
      denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
      kind: "native"
    }

    expect(getWalletSwapAssetId(asset)).toBe("native:uusd")
    expect(getWalletSwapCounterAssetId(asset)).toBe("native:uluna")
    expect(getWalletSwapPath(asset)).toBe("/swap?from=native%3Auusd&to=native%3Auluna")
  })

  it("routes token assets against LUNC by default", () => {
    const asset = {
      denom: "terra1TokenContract",
      kind: "cw20"
    }

    expect(getWalletSwapAssetId(asset)).toBe("cw20:terra1tokencontract")
    expect(getWalletSwapCounterAssetId(asset)).toBe("native:uluna")
    expect(getWalletSwapPath(asset)).toBe(
      "/swap?from=cw20%3Aterra1tokencontract&to=native%3Auluna"
    )
  })

  it("normalizes IBC hashes before routing to swap", () => {
    const asset = {
      denom: "ibc/abcdef123",
      kind: "native"
    }

    expect(getWalletSwapAssetId(asset)).toBe("native:ibc/ABCDEF123")
    expect(getWalletSwapCounterAssetId(asset)).toBe("native:uluna")
    expect(getWalletSwapPath(asset)).toBe(
      "/swap?from=native%3Aibc%2FABCDEF123&to=native%3Auluna"
    )
  })
})
