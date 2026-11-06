import { describe, expect, it } from "vitest"
import type { TxItem } from "../src/app/data/classic"
import {
  collectHistoryNativeDenoms,
  formatCoins,
  formatHistoryCoin,
  parseTokenWord
} from "../src/app/history/historyFormat"

describe("history amount integrity", () => {
  it("uses explicit eight- and zero-decimal units for messages and fees", () => {
    const resolve = (denom: string) => denom === "ueight"
      ? { decimals: 8, symbol: "EIGHT" } : { decimals: 0, symbol: "ZERO" }
    expect(formatCoins([{ denom: "ueight", amount: "100000000" }], resolve)).toBe("1 EIGHT")
    expect(formatCoins([{ denom: "uzero", amount: "123" }], resolve)).toBe("123 ZERO")
    expect(formatHistoryCoin("123456789", "ueight", resolve)).toBe("1.23456789 EIGHT")
  })

  it.each([undefined, -1, 1.5, NaN, Infinity, 309, "8"])("never invents six decimals for %s", decimals => {
    const resolve = () => ({ symbol: "UNKNOWN", decimals: decimals as number })
    expect(formatHistoryCoin("100000000", "factory/terra1creator/token", resolve))
      .toBe("100,000,000 raw units UNKNOWN")
  })

  it("does not give an unknown contract a unit based on its label or ticker", () => {
    expect(formatHistoryCoin("100000000", "terra1contract", () => ({ symbol: "LUNC" })))
      .toBe("100,000,000 raw units LUNC")
  })

  it("keeps raw integers above Number.MAX_SAFE_INTEGER exact", () => {
    expect(formatHistoryCoin("340282366920938463463374607431768211455", "uzero", () => ({ decimals: 0, symbol: "ZERO" })))
      .toBe("340,282,366,920,938,463,463,374,607,431,768,211,455 ZERO")
  })

  it("handles only the explicitly known six-decimal native anchors without metadata", () => {
    expect(formatCoins([{ denom: "uluna", amount: "1000000" }, { denom: "uusd", amount: "1000000" }]))
      .toMatch(/^1 (LUNC|LUNA), 1 USTC$/)
    expect(formatHistoryCoin("1000000", "uother")).toBe("1,000,000 raw units OTHER")
  })

  it("shows unavailable amounts rather than fabricating a valid zero", () => {
    expect(formatHistoryCoin("NaN", "ueight", () => ({ decimals: 8, symbol: "EIGHT" }))).toBe("-- EIGHT")
  })

  it("marks bounded fractional display as approximate or below threshold, not zero", () => {
    expect(formatHistoryCoin("1", "utiny", () => ({ decimals: 30, symbol: "TINY" })))
      .toBe("<0.000000000000000001 TINY")
    expect(formatHistoryCoin("11234567891234567891", "utiny", () => ({ decimals: 19, symbol: "TINY" })))
      .toBe("≈1.123456789123456789 TINY")
  })

  it("parses canonical amounts with full bank denominations", () => {
    expect(parseTokenWord("123factory/terra1creator/token-name.v1"))
      .toEqual({ type: "single", amount: "123", denom: "factory/terra1creator/token-name.v1" })
    expect(parseTokenWord("123ibc/ABC"))
      .toEqual({ type: "single", amount: "123", denom: "ibc/ABC" })
  })

  it("resolves units for bank sends, IBC token, multisend, fees and transfer events", () => {
    const tx = {
      tx: {
        body: { messages: [
          { "@type": "/cosmos.bank.v1beta1.MsgSend", amount: [{ denom: "ueight", amount: "1" }] },
          { "@type": "/ibc.applications.transfer.v1.MsgTransfer", token: { denom: "ibc/ABC", amount: "2" } },
          { inputs: [{ coins: [{ denom: "uinput", amount: "3" }] }], outputs: [{ coins: [{ denom: "uoutput", amount: "4" }] }] }
        ] },
        auth_info: { fee: { amount: [{ denom: "ufee", amount: "5" }] } }
      },
      events: [{ type: "transfer", attributes: [{ key: "amount", value: "6factory/terra1creator/event-token,7ueight" }] }]
    } as TxItem
    expect(collectHistoryNativeDenoms([tx]))
      .toEqual(["factory/terra1creator/event-token", "ibc/ABC", "ueight", "ufee", "uinput", "uoutput"])
  })
})
