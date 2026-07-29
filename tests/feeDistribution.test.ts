import { describe, expect, it } from "vitest"
import {
  applyLunaNetworkRewardFee,
  buildSwapRevenueDistribution,
  buildRevenueDistribution,
  isSupportedRevenueAsset,
  splitRevenueFee,
  WEB_FEE_COLLECTOR_ADDRESS
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

  it("collects the full 0.2% fee for unsupported native and CW20 assets", () => {
    const nativePlan = buildSwapRevenueDistribution({
      amount: 2_000n,
      asset: { type: "native", denom: "ibc/ABC" },
      chainKey: "luna",
      sender: "terra1sender"
    })
    expect(nativePlan.messages.map((message) => message.typeUrl)).toEqual([
      "/cosmos.bank.v1beta1.MsgSend"
    ])
    expect(nativePlan.messages[0]?.value).toMatchObject({
      toAddress: WEB_FEE_COLLECTOR_ADDRESS,
      amount: [{ denom: "ibc/ABC", amount: "2000" }]
    })
    expect(nativePlan.split.collector).toBe(2_000n)
    expect(nativePlan.receiptSupported).toBe(false)

    const cw20Plan = buildSwapRevenueDistribution({
      amount: 3_000n,
      asset: { type: "cw20", contract: "terra1contract" },
      chainKey: "lunc",
      sender: "terra1sender"
    })
    expect(cw20Plan.messages.map((message) => message.typeUrl)).toEqual([
      "/cosmwasm.wasm.v1.MsgExecuteContract"
    ])
    const cw20Message = cw20Plan.messages[0]?.value as {
      contract?: string
      msg?: Uint8Array
    }
    expect(cw20Message.contract).toBe("terra1contract")
    expect(
      JSON.parse(new TextDecoder().decode(cw20Message.msg))
    ).toEqual({
      transfer: {
        recipient: WEB_FEE_COLLECTOR_ADDRESS,
        amount: "3000"
      }
    })
    expect(cw20Plan.split.collector).toBe(3_000n)
    expect(cw20Plan.receiptSupported).toBe(false)
  })

  it("keeps supported native swap fees on the automatic 5/5/5/85 path", () => {
    const plan = buildSwapRevenueDistribution({
      amount: 1_000_000n,
      asset: { type: "native", denom: "uluna" },
      chainKey: "lunc",
      sender: "terra1sender"
    })
    expect(plan.messages).toHaveLength(4)
    expect(plan.split.collector).toBe(850_000n)
    expect(plan.receiptSupported).toBe(true)
  })
})
