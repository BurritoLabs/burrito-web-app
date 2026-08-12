import { describe, expect, it } from "vitest"
import { normalizeDashboardMetricSeries } from "../src/app/data/dashboardMetrics"

describe("normalizeDashboardMetricSeries", () => {
  it("sorts metric points and converts micro units", () => {
    expect(
      normalizeDashboardMetricSeries(
        {
          status: "limited",
          points: [
            { timestamp: 2, value: "2500000" },
            { timestamp: 1, value: 1000000 },
            { timestamp: 3, value: "invalid" }
          ],
          latestValue: "2500000",
          limitations: ["partial history"]
        },
        1_000_000
      )
    ).toEqual({
      status: "limited",
      points: [
        { time: 1_000, value: 1 },
        { time: 2_000, value: 2.5 }
      ],
      latestValue: 2.5,
      limitations: ["partial history"]
    })
  })
})
