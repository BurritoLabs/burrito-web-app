import { describe, expect, it } from "vitest"
import {
  applyLunaNetworkRewardFee,
  buildRevenueDistribution,
  isSupportedRevenueAsset,
  splitRevenueFee
} from "../src/app/revenue/feeDistribution"

describe("revenue fee distribution", () => {
  it("splits supported revenue into 5/5/5/85", () => {
    expect(splitRevenueFee(1_000_000n)).toEqual({
      burn: 50_000n,
      communityPool: 50_000n,
      networkRewards: 50_000n,
      collector: 850_000n
    })
  })

  it("supports only LUNC, USTC, and LUNA", () => {
    expect(isSupportedRevenueAsset("lunc", "uluna")).toBe(true)
    expect(isSupportedRevenueAsset("lunc", "uusd")).toBe(true)
    expect(isSupportedRevenueAsset("luna", "uluna")).toBe(true)
    expect(isSupportedRevenueAsset("lunc", "ibc/ABC")).toBe(false)
    expect(isSupportedRevenueAsset("luna", "uusd")).toBe(false)
  })

  it("builds the Classic burn, community, oracle, and collector transfers", () => {
    const plan = buildRevenueDistribution({
      amount: 1_000_000n,
      chainKey: "lunc",
      denom: "uusd",
      sender: "terra1sender"
    })
    expect(plan.messages.map((message) => message.typeUrl)).toEqual([
      "/cosmos.bank.v1beta1.MsgSend",
      "/cosmos.distribution.v1beta1.MsgFundCommunityPool",
      "/cosmos.bank.v1beta1.MsgSend",
      "/cosmos.bank.v1beta1.MsgSend"
    ])
    expect(plan.networkRewardFee).toBe(0n)
  })

  it("uses the Luna third share as the transaction fee", () => {
    const plan = buildRevenueDistribution({
      amount: 1_000_000n,
      chainKey: "luna",
      denom: "uluna",
      sender: "terra1sender"
    })
    expect(plan.messages).toHaveLength(3)
    expect(plan.networkRewardFee).toBe(50_000n)
    expect(applyLunaNetworkRewardFee(
      { amount: [{ denom: "uluna", amount: "6000" }], gas: "400000" },
      "uluna",
      plan.networkRewardFee
    )).toEqual({
      amount: [{ denom: "uluna", amount: "50000" }],
      gas: "400000"
    })
    expect(applyLunaNetworkRewardFee(
      { amount: [{ denom: "uluna", amount: "60000" }], gas: "400000" },
      "uluna",
      plan.networkRewardFee
    )).toEqual({
      amount: [{ denom: "uluna", amount: "60000" }],
      gas: "400000"
    })
  })
})
