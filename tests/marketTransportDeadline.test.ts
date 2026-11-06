import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { throwIfRequestAborted, withRequestDeadline } from "../src/app/data/requestDeadline"
import { fetchJsonWithEndpointFallback, fetchWithEndpointFallback } from "../src/app/data/endpointFallback"
import { fetchSharedPairCandles } from "../src/app/data/sharedMarketApi"
import { fetchBinodesDexTxDetails } from "../src/app/data/binodes"

const lcd = "https://terra-classic-lcd.publicnode.com/cosmos/tx/v1beta1/txs"
const pending = () => new Promise<never>(() => {})
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("bounded market transport", () => {
  it("checks cancellation without requiring signal.throwIfAborted", () => {
    const caller = new AbortController()
    Object.defineProperty(caller.signal, "throwIfAborted", { value: undefined })
    expect(() => throwIfRequestAborted(caller.signal)).not.toThrow()
    const reason = new Error("obsolete request")
    caller.abort(reason)
    expect(() => throwIfRequestAborted(caller.signal)).toThrow(reason)
  })

  it("rejects and aborts an uncooperative operation on deadline, with an external signal", async () => {
    const caller = new AbortController()
    let child: AbortSignal | undefined
    const result = withRequestDeadline(async (signal) => { child = signal; return pending() }, { signal: caller.signal, timeoutMs: 50 })
    const assertion = expect(result).rejects.toMatchObject({ name: "TimeoutError" })
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(child?.aborted).toBe(true)
    expect(caller.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not start pre-aborted work and cleans up after normal settlement", async () => {
    const caller = new AbortController()
    caller.abort()
    const operation = vi.fn(async () => 1)
    await expect(withRequestDeadline(operation, { signal: caller.signal, timeoutMs: 50 })).rejects.toMatchObject({ name: "AbortError" })
    expect(operation).not.toHaveBeenCalled()
    const fresh = new AbortController()
    const remove = vi.spyOn(fresh.signal, "removeEventListener")
    expect(await withRequestDeadline(operation, { signal: fresh.signal, timeoutMs: 50 })).toBe(1)
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it("preserves the caller's abort reason and removes its listener", async () => {
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, "removeEventListener")
    const reason = new Error("navigation superseded this request")
    let child: AbortSignal | undefined
    const result = withRequestDeadline(async (signal) => { child = signal; return pending() }, { signal: caller.signal, timeoutMs: 50 })
    const assertion = expect(result).rejects.toBe(reason)
    caller.abort(reason)
    await assertion
    expect(child?.reason).toBe(reason)
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps per-endpoint timeouts when a caller signal is supplied", async () => {
    const caller = new AbortController()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal)
      return pending()
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchWithEndpointFallback(lcd, { signal: caller.signal, timeoutMs: 50 })
    const assertion = expect(result).rejects.toMatchObject({ name: "TimeoutError" })
    await vi.advanceTimersByTimeAsync(150)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it("cancels immediately without trying the next endpoint", async () => {
    const caller = new AbortController()
    const fetchMock = vi.fn(async () => pending())
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchWithEndpointFallback(lcd, { signal: caller.signal, timeoutMs: 50 })
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" })
    caller.abort()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([false, true])("preserves post-headers caller cancellation (legacy=%s)", async (legacy) => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any")!
    if (legacy) Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined })
    try {
      const caller = new AbortController()
      let transportSignal: AbortSignal | undefined
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        transportSignal = init.signal as AbortSignal
        return new Response("body not yet consumed")
      }))
      const response = await fetchWithEndpointFallback(lcd, { signal: caller.signal, timeoutMs: 50 })
      expect(response.ok).toBe(true)
      caller.abort()
      expect(transportSignal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      Object.defineProperty(AbortSignal, "any", descriptor)
    }
  })

  it("retains a bounded headers deadline without native signal composition", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any")!
    Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined })
    try {
      const caller = new AbortController()
      let child: AbortSignal | undefined
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { child = init.signal as AbortSignal; return pending() }))
      const result = fetchWithEndpointFallback("https://fixture.invalid/read", { signal: caller.signal, timeoutMs: 50 })
      const assertion = expect(result).rejects.toMatchObject({ name: "TimeoutError" })
      await vi.advanceTimersByTimeAsync(50)
      await assertion
      expect(child?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      Object.defineProperty(AbortSignal, "any", descriptor)
    }
  })

  it("bounds post-headers signal forwarding and removes caller listeners", async () => {
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, "removeEventListener")
    let child: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      child = init.signal as AbortSignal
      return new Response("body")
    }))
    await fetchWithEndpointFallback(lcd, { signal: caller.signal, timeoutMs: 50 })
    expect(child?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(child?.aborted).toBe(true)
    expect(child?.reason).toMatchObject({ name: "TimeoutError" })
    expect(remove).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("bounds JSON body consumption and can recover via the next endpoint", async () => {
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        firstSignal = init.signal as AbortSignal
        return { ok: true, status: 200, json: pending }
      }
      return new Response(JSON.stringify({ tx_responses: [] }))
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchJsonWithEndpointFallback<{ tx_responses: unknown[] }>(lcd, { timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    expect(await result).toEqual({ ok: true, status: 200, data: { tx_responses: [] } })
    expect(firstSignal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("aborts shared JSON without requesting activation, and retains its 8s deadline", async () => {
    const caller = new AbortController()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal)
      return { ok: true, status: 200, json: pending }
    })
    vi.stubGlobal("fetch", fetchMock)
    const options = { chainId: "columbus-5", pairAddress: "terra1deadline", leftAssetKey: "uluna", rightAssetKey: "uusd", bucketMs: 60_000, maxCandles: 10 }
    const result = fetchSharedPairCandles({ ...options, signal: caller.signal })
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" })
    caller.abort()
    await assertion
    expect(signals[0].aborted).toBe(true)
    const timeoutResult = fetchSharedPairCandles(options)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await timeoutResult).toEqual([])
    expect(signals[1].aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("never activates a pair if an aborted shared body resolves late", async () => {
    const caller = new AbortController()
    let resolveBody!: (value: unknown) => void
    const body = new Promise<unknown>(resolve => { resolveBody = resolve })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: () => body }))
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchSharedPairCandles({ chainId: "columbus-5", pairAddress: "terra1late-deadline", leftAssetKey: "uluna", rightAssetKey: "uusd", bucketMs: 60_000, maxCandles: 10, signal: caller.signal })
    await Promise.resolve()
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" })
    caller.abort()
    resolveBody({ status: "unavailable", limitations: ["candles_not_indexed"] })
    await assertion
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("propagates caller cancellation through Binodes JSON and stops pagination", async () => {
    const caller = new AbortController()
    let child: AbortSignal | undefined
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      child = init.signal as AbortSignal
      return { ok: true, status: 200, json: pending }
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchBinodesDexTxDetails({ pairAddress: "terra1deadline", limit: 200, signal: caller.signal })
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" })
    caller.abort()
    await assertion
    expect(child?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("bounds a hung Binodes body even without caller cancellation", async () => {
    let child: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      child = init.signal as AbortSignal
      return { ok: true, status: 200, json: pending }
    }))
    const result = fetchBinodesDexTxDetails({ pairAddress: "terra1deadline" })
    const assertion = expect(result).rejects.toMatchObject({ name: "TimeoutError" })
    await vi.advanceTimersByTimeAsync(3_500)
    await assertion
    expect(child?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
