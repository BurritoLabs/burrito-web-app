import React, { createElement, type ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MarketPairChartPanel from "../src/pages/market/MarketPairChartPanel"

const baseProps: ComponentProps<typeof MarketPairChartPanel> = {
  activeCandle: { bucketStart: 1_791_372_600_000, open: 0.0058, high: 0.0059, low: 0.0057, close: 0.00582, volumeQuote: 1200 },
  candleTimeLabel: "Oct 07, 12:00",
  chartHostRef: { current: null },
  chartPairLabel: "LUNC/USTC",
  chartTooltipRef: { current: null },
  hasCandles: true,
  isCandlesEnabled: true,
  isCandlesError: false,
  isCandlesLoading: false,
  onResetView: () => undefined,
  onRetryCandles: () => undefined,
  onTimeframeChange: () => undefined,
  quoteSymbol: "USTC",
  timeframe: "24h"
}

const render = (props: Partial<typeof baseProps> = {}) =>
  renderToStaticMarkup(createElement(MarketPairChartPanel, { ...baseProps, ...props }))

describe("market chart presentation", () => {
  beforeEach(() => vi.stubGlobal("React", React))
  afterEach(() => vi.unstubAllGlobals())

  it.each([["1h", "1m"], ["24h", "30m"], ["7d", "2h"]] as const)(
    "distinguishes the %s lookback from its %s candle interval",
    (timeframe, interval) => {
      const html = render({ timeframe })
      expect(html).toContain(`${interval} candles`)
      expect(html).toContain(`LUNC/USTC ${timeframe} price chart`)
      expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${timeframe}</button>`))
    }
  )

  it("keeps OHLC in quote units without repeating a currency on every value", () => {
    const html = render()
    expect(html).toContain("0.00582")
    expect(html).not.toContain("$")
    // Unit once in the chart title and once on volume; once more in the accessible pair label.
    expect(html.match(/USTC/g)).toHaveLength(3)
    expect(html).toContain('aria-label="Selected candle values"')
    expect(html).toContain('aria-label="Reset chart view"')
  })

  it("retains an existing chart while a refresh is pending or fails", () => {
    const html = render({ isCandlesLoading: true, isCandlesError: true })
    expect(html).toContain('aria-label="LUNC/USTC 24h price chart"')
    expect(html).not.toContain("Try again")
    expect(html).not.toContain("Loading recent swaps")
  })

  it("provides a retry action for failed first loads and disables empty-chart reset", () => {
    const html = render({ activeCandle: undefined, hasCandles: false, isCandlesError: true })
    expect(html).toContain('role="alert"')
    expect(html).toContain("Try again")
    expect(html).toMatch(/disabled=""[^>]*aria-label="Reset chart view"/)
    expect(html).not.toContain('aria-label="LUNC/USTC 24h price chart"')
  })

  it("distinguishes empty history from invalid-price unavailability", () => {
    expect(render({ activeCandle: undefined, hasCandles: false })).toContain("No recent swaps to build candles")
    expect(render({ activeCandle: undefined, hasCandles: false, isCandlesEnabled: false })).toContain("Chart unavailable until this pair has a valid price")
  })
})
