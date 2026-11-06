import { describe, expect, it } from "vitest"
import {
  dashboardActivityPoints, dashboardActivityTotal, dashboardBurnAmount,
  dashboardBurnPoints, dashboardFeeYieldPoints
} from "../src/app/dashboard/activityPresentation"

const dt = "2026-11-06T12:00:00Z"
describe("Dashboard partial source presentation", () => {
  it("does not turn missing network metrics into zero when only fees or burns succeeded", () => {
    const partial = [{ dt, feeGasUsd: 1, luncBurnUsd: 10 }]
    expect(dashboardActivityPoints(partial, "transferAmountUsd")).toEqual([])
    expect(dashboardActivityPoints(partial, "activeAddressCount")).toEqual([])
    expect(dashboardActivityTotal([])).toBeUndefined()
    expect(dashboardBurnAmount(undefined)).toBeUndefined()
    expect(dashboardBurnPoints(partial)).toEqual([])
  })
  it("retains explicitly observed zeros as legitimate metrics and chart points", () => {
    const points = dashboardActivityPoints([{ dt, transferAmountUsd: 0 }], "transferAmountUsd")
    expect(points).toEqual([{ time: Date.parse(dt), value: 0 }])
    expect(dashboardActivityTotal(points)).toBe(0)
    expect(dashboardBurnAmount({ fee_burn_amt_actual: 0, voluntary_burn_amt_actual: 0 })).toBe(0)
    expect(dashboardBurnPoints([{ dt, luncBurnUsd: 0, ustcBurnUsd: 0 }])).toHaveLength(1)
  })
  it("does not fabricate the missing half of a burn total", () => {
    expect(dashboardBurnAmount({ fee_burn_amt_actual: 10 })).toBeUndefined()
    expect(dashboardBurnAmount({ fee_burn_amt_actual: 10, voluntary_burn_amt_actual: 5 })).toBe(15)
  })
  it("ignores malformed times/values without adding zero buckets", () => {
    expect(dashboardActivityPoints([{ dt: "bad", transferAmountUsd: 10 }, { dt, transferAmountUsd: NaN }], "transferAmountUsd"))
      .toEqual([])
  })
  it("requires actual fee, staking and price inputs for a fee-based yield estimate", () => {
    const series = [{ dt }, { dt, feeGasUsd: 0 }, { dt, feeGasUsd: 1 }]
    expect(dashboardFeeYieldPoints(series, undefined, 1, 365)).toEqual([])
    expect(dashboardFeeYieldPoints(series, 100, undefined, 365)).toEqual([])
    expect(dashboardFeeYieldPoints(series, 100, 0, 365)).toEqual([])
    expect(dashboardFeeYieldPoints(series, 100, 1, 365)).toEqual([
      { time: Date.parse(dt), value: 0 }, { time: Date.parse(dt), value: 365 }
    ])
  })
})
