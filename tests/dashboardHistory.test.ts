import { describe, expect, it } from "vitest"
import {
  calculateHistoryChange,
  normalizeBinanceHourlyPrices
} from "../src/app/data/dashboardHistory"

describe("calculateHistoryChange", () => {
  it("calculates the percentage change from the first to last point", () => {
    expect(
      calculateHistoryChange([
        { time: 1, value: 80 },
        { time: 2, value: 100 }
      ])
    ).toBe(25)
  })

  it("does not report a change without a valid baseline", () => {
    expect(calculateHistoryChange([{ time: 1, value: 100 }])).toBeUndefined()
    expect(
      calculateHistoryChange([
        { time: 1, value: 0 },
        { time: 2, value: 100 }
      ])
    ).toBeUndefined()
  })
})

describe("normalizeBinanceHourlyPrices", () => {
  it("uses the hourly close price and removes invalid candles", () => {
    expect(
      normalizeBinanceHourlyPrices([
        [2_000, "1", "2", "0.5", "1.5"],
        [1_000, "1", "2", "0.5", "1.25"],
        [3_000, "1", "2", "0.5", "0"]
      ])
    ).toEqual([
      { time: 1_000, value: 1.25 },
      { time: 2_000, value: 1.5 }
    ])
  })
})
