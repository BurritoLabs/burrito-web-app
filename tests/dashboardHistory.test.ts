import { describe, expect, it } from "vitest"
import { calculateHistoryChange } from "../src/app/data/dashboardHistory"

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
