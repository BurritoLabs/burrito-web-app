import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchBinodesDashboardActivity } from "../src/app/data/binodes"

const dt = "2026-11-06T05:00:00Z"
const endpoints = ["network", "burns", "fees", "stake", "luncBurns", "ustcBurns"]
const response = (data: unknown) => new Response(JSON.stringify({ code: 200, data }))
const pending = () => new Promise<never>(() => {})
const fixtureRow = (url: string) => {
  if (url.includes("/network/")) return { dt, tx_total_cnt: 0, fee_gas_usd: 0, fee_cp_usd: 0, fee_op_usd: 0, fee_burn_usd: 0 }
  if (url.includes("/fees/")) return { dt, fee_gas_usd: 0, fee_cp_usd: 0, fee_op_usd: 0 }
  if (url.includes("/stake/")) return { dt, staking_delegate_usd: 0 }
  if (url.includes("assets_info")) return { dt, fee_burn_amt_actual: 0, voluntary_burn_amt_actual: 0, fee_burn_amt_usd: 0, voluntary_burn_usd: 0 }
  return { dt, fee_burn_usd: 0, voluntary_burn_usd: 0 }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("BI Node dashboard source integrity", () => {
  it("keeps legitimate zero aggregates and series values", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response([fixtureRow(url)])))
    const result = await fetchBinodesDashboardActivity()
    expect(result.coverage).toEqual({ status: "complete", failedEndpoints: [], emptyEndpoints: [] })
    expect(result.network?.tx_total_cnt).toBe(0)
    expect(result.series[0]).toMatchObject({ totalFeeUsd: 0, burnUsd: 0, luncBurnAmount: 0, ustcBurnUsd: 0 })
  })

  it("distinguishes healthy empty responses from unavailable sources", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([])))
    const result = await fetchBinodesDashboardActivity()
    expect(result.coverage).toEqual({ status: "complete", failedEndpoints: [], emptyEndpoints: endpoints })
    expect(result.network).toBeUndefined()
    expect(result.series).toEqual([])
    expect(result.bucketCount).toBe(0)
  })

  it("keeps independent stake data when all three core reads fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/stake/")
      ? response([{ dt, staking_delegate_usd: 4 }]) : new Response("down", { status: 503 })))
    const result = await fetchBinodesDashboardActivity()
    expect(result.coverage).toMatchObject({ status: "partial", failedEndpoints: ["network", "burns", "fees", "luncBurns", "ustcBurns"] })
    expect(result.stake?.staking_delegate_usd).toBe(4)
    expect(result.network).toBeUndefined()
    expect(result.series[0].totalFeeUsd).toBeUndefined()
    expect(result.series[0].burnUsd).toBeUndefined()
  })

  it.each([null, {}, "invalid", [{ dt }], [null], [{ dt, tx_total_cnt: "0" }], [{ dt, tx_total_cnt: null }], [{ dt: "not-a-date", tx_total_cnt: 1 }]])(
    "classifies malformed network payload %j as failed, not zero", async (data) => {
      vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.includes("/network/") ? data : [])))
      const result = await fetchBinodesDashboardActivity()
      expect(result.coverage?.failedEndpoints).toEqual(["network"])
      expect(result.network).toBeUndefined()
    }
  )

  it("does not manufacture missing aggregate fields or incomplete totals", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.includes("/network/")
      ? [{ dt, tx_total_cnt: 0, fee_gas_usd: 2 }] : [])))
    const result = await fetchBinodesDashboardActivity()
    expect(result.network?.tx_total_cnt).toBe(0)
    expect(result.network?.fee_cp_usd).toBeUndefined()
    expect(result.series[0].totalFeeUsd).toBeUndefined()
  })

  it("rejects all-source failure with explicit coverage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    await expect(fetchBinodesDashboardActivity()).rejects.toMatchObject({
      name: "BinodesDashboardUnavailableError",
      coverage: { status: "unavailable", failedEndpoints: endpoints }
    })
  })

  it.each(["headers", "json"])("bounds stalled %s and aborts all six transports at the existing deadline", async (stage) => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal)
      return stage === "headers" ? pending() : { ok: true, status: 200, json: pending }
    }))
    const result = fetchBinodesDashboardActivity()
    const assertion = expect(result).rejects.toMatchObject({ name: "BinodesDashboardUnavailableError" })
    expect(signals).toHaveLength(6)
    await vi.advanceTimersByTimeAsync(3_500)
    await assertion
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("propagates caller cancellation instead of caching an unavailable or zero result", async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const signals: AbortSignal[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal)
      return { ok: true, status: 200, json: pending }
    }))
    const result = fetchBinodesDashboardActivity("HOUR", 50, caller.signal)
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" })
    caller.abort()
    await assertion
    expect(signals).toHaveLength(6)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
