import { describe, expect, it } from "vitest"
import {
  chartPriceMinMove,
  formatAxisPrice,
  formatChartAxisPrice,
  formatChartAxisUsd
} from "../src/app/market/pairChart"
import { formatCandleVolume } from "../src/app/market/pairChart"

describe("pair chart small-price display", () => {
  it("distinguishes unavailable quote volume from a genuinely observed zero", () => {
    expect(formatCandleVolume({ volumeQuote: 0, volumeKnown: false })).toBe("--")
    expect(formatCandleVolume({ volumeQuote: 0 })).toBe("0")
    expect(formatCandleVolume({ volumeQuote: NaN })).toBe("--")
    expect(formatCandleVolume()).toBe("--")
  })
  it("keeps meaningful digits for sub-cent and very small prices", () => {
    expect(formatAxisPrice(0.000000000123456)).toBe("0.000000000123456")
    expect(formatChartAxisPrice(0.000000000123456)).toBe("0.000000000123456")
    expect(formatChartAxisUsd(0.000000000123456, 2)).toBe("$0.000000000246912")
    expect(formatAxisPrice(1.23e-20)).toBe("1.2300e-20")
  })

  it("rounds floating-point artifacts without collapsing distinct axis ticks", () => {
    expect(formatAxisPrice(1 + 24 * 0.00001 + 0.00001)).toBe("1.00025")
    expect(formatChartAxisPrice(0.99999)).toBe("0.99999")
    expect(formatChartAxisUsd(1 + 24 * 0.00001 + 0.00001, 1)).toBe("$1.00025")
  })

  it("sets chart precision relative to observed prices", () => {
    expect(chartPriceMinMove([0.000000000123, 0.000000000124])).toBe(1e-14)
    expect(chartPriceMinMove([0, Number.NaN])).toBe(1e-8)
  })

  it("keeps axis and OHLC readouts compact without changing detailed candle precision", () => {
    expect(formatChartAxisPrice(0.0058970065703)).toBe("0.00589701")
    expect(formatAxisPrice(0.0058970065703)).toBe("0.0058970065703")
  })
})
