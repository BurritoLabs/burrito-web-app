import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchDashboardPriceHistory } from "../src/app/data/dashboardHistory"
import { fetchLunaDashboardMetric, normalizeDashboardMetricSeries } from "../src/app/data/dashboardMetrics"

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("Dashboard history request lifetime", () => {
  it.each(["price", "metric"])("bounds %s JSON body even if transport ignores cancellation", async kind => {
    vi.useFakeTimers()
    let transport: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (_input, init: RequestInit) => {
      transport = init.signal as AbortSignal
      return { ok: true, status: 200, json: () => new Promise(() => {}) }
    }))
    const request = kind === "price" ? fetchDashboardPriceHistory("lunc", 86400000) : fetchLunaDashboardMetric("delegators", "24h")
    const rejected = expect(request).rejects.toThrow("Request deadline exceeded")
    await vi.advanceTimersByTimeAsync(8000)
    await rejected
    expect(transport?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("cancels an obsolete price range without waiting for its timeout", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let transport: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (_input, init: RequestInit) => {
      transport = init.signal as AbortSignal
      return new Promise(() => {})
    }))
    const request = fetchDashboardPriceHistory("lunc", 86400000, undefined, controller.signal)
    const rejected = expect(request).rejects.toThrow("Range changed")
    controller.abort(new Error("Range changed"))
    await rejected
    expect(transport?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("does not append a spot quote to missing historical observations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])))
    expect(await fetchDashboardPriceHistory("lunc", 7 * 86400000, 123)).toEqual([])
  })
  it.each([null, undefined, "", " ", false])("does not coerce unavailable latest metric %s to zero", value => {
    expect(normalizeDashboardMetricSeries({ latestValue: value } as never).latestValue).toBeUndefined()
  })
  it("preserves explicit zero and filters missing metric points", () => {
    expect(normalizeDashboardMetricSeries({ latestValue: 0, points: [
      { timestamp: 1, value: null }, { timestamp: 2, value: "" }, { timestamp: 3, value: "0" }
    ] } as never)).toMatchObject({ latestValue: 0, points: [{ time: 3000, value: 0 }] })
  })
})
