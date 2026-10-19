import React, { createElement, type ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MarketRecentTrades from "../src/pages/market/MarketRecentTrades"

vi.mock("../src/app/appChainContext", () => ({ useAppChain: () => ({ chainKey: "lunc" }) }))
const props: ComponentProps<typeof MarketRecentTrades> = {
  baseSymbol: "LUNC", priceQuoteSymbol: "USTC", priceQuoteUsd: 0.005,
  hasMoreTrades: false, isTradesLoading: false, isTradesError: false,
  onLoadMore: () => {}, onRetryTrades: () => {}, trades: []
}
const render = (overrides: Partial<typeof props> = {}) =>
  renderToStaticMarkup(createElement(MarketRecentTrades, { ...props, ...overrides }))

describe("trade history failures", () => {
  beforeEach(() => vi.stubGlobal("React", React))
  afterEach(() => vi.unstubAllGlobals())
  it("does not claim no swaps when the history request failed", () => {
    const html = render({ isTradesError: true })
    expect(html).toContain('role="alert"')
    expect(html).toContain("Retry trades")
    expect(html).not.toContain("No recent swaps")
  })
  it("keeps the successful empty result distinct", () => {
    expect(render()).toContain("No recent swaps")
    expect(render()).not.toContain("Retry trades")
  })
})
