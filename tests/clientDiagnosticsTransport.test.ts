import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const metricEndpoint = "https://diagnostics.example.test/metrics"
const errorEndpoint = "https://diagnostics.example.test/errors"

describe("credential-free client diagnostics", () => {
  let cleanup: (() => void) | undefined
  let windowEvents: EventTarget
  let documentEvents: EventTarget
  let fetchMock: ReturnType<typeof vi.fn>
  let beacon: ReturnType<typeof vi.fn>
  let disconnect: ReturnType<typeof vi.fn>
  let navigation: { responseStart: number; type: string }[]

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("PROD", true)
    vi.stubEnv("VITE_CLIENT_METRIC_ENDPOINT", metricEndpoint)
    vi.stubEnv("VITE_CLIENT_ERROR_ENDPOINT", errorEndpoint)
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    beacon = vi.fn().mockReturnValue(true)
    disconnect = vi.fn()
    navigation = [{ responseStart: 125.5, type: "navigate" }]
    class Observer {
      observe() {}
      disconnect() { disconnect() }
    }
    windowEvents = Object.assign(new EventTarget(), {
      location: {
        hostname: "wallet.example.test",
        origin: "https://wallet.example.test",
        pathname: "/privacy",
        search: "?private-test-query=do-not-send",
        hash: "#do-not-send"
      },
      navigator: { sendBeacon: beacon, userAgent: "Diagnostics QA" },
      PerformanceObserver: Observer
    })
    documentEvents = Object.assign(new EventTarget(), { visibilityState: "hidden" })
    vi.stubGlobal("window", windowEvents)
    vi.stubGlobal("document", documentEvents)
    vi.stubGlobal("navigator", { sendBeacon: beacon })
    vi.stubGlobal("PerformanceObserver", Observer)
    vi.stubGlobal("performance", {
      getEntriesByType: (type: string) => type === "navigation" ? navigation : []
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("sends vital JSON via keepalive fetch without credentials even when Beacon is available", async () => {
    const { installClientWebVitals } = await import("../src/app/feedback/clientWebVitals")
    cleanup = installClientWebVitals()
    expect(beacon).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(metricEndpoint, {
      method: "POST",
      body: expect.any(String),
      headers: { "content-type": "application/json" },
      credentials: "omit",
      keepalive: true
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      metric: "TTFB", value: 126, rating: "good", path: "/privacy",
      network: "columbus-5", navigationType: "navigate", release: "test"
    })
  })

  it("flushes each vital once and removes lifecycle listeners on cleanup", async () => {
    const { installClientWebVitals } = await import("../src/app/feedback/clientWebVitals")
    cleanup = installClientWebVitals()
    documentEvents.dispatchEvent(new Event("visibilitychange"))
    windowEvents.dispatchEvent(new Event("pagehide"))
    cleanup()
    cleanup = undefined
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).metric)).toEqual(["TTFB", "CLS"])
    expect(disconnect).toHaveBeenCalledTimes(4)
    documentEvents.dispatchEvent(new Event("visibilitychange"))
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([NaN, Infinity, -1])("does not send invalid vital value %s", async (value) => {
    navigation[0].responseStart = value
    const { installClientWebVitals } = await import("../src/app/feedback/clientWebVitals")
    cleanup = installClientWebVitals()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["localhost", "127.0.0.1"])("does not collect metrics on %s", async (hostname) => {
    window.location.hostname = hostname
    const { installClientWebVitals } = await import("../src/app/feedback/clientWebVitals")
    cleanup = installClientWebVitals()
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not collect metrics in development", async () => {
    vi.stubEnv("PROD", false)
    const { installClientWebVitals } = await import("../src/app/feedback/clientWebVitals")
    cleanup = installClientWebVitals()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps error redaction and excludes query/fragment while omitting credentials", async () => {
    const { reportRuntimeError } = await import("../src/app/feedback/runtimeErrorReporter")
    const address = `terra1${"q".repeat(38)}`
    reportRuntimeError({ kind: "error", error: new Error(`Synthetic failure ${address}`) })
    expect(beacon).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(errorEndpoint, {
      method: "POST",
      body: expect.any(String),
      headers: { "content-type": "application/json" },
      credentials: "omit",
      keepalive: true
    })
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.message).toBe("Synthetic failure <terra_address>")
    expect(payload.url).toBe("https://wallet.example.test/privacy")
    expect(payload.userAgent).toBe("Diagnostics QA")
    expect(payload.stack).not.toContain(address)
  })

  it("preserves error deduplication and the four-report window", async () => {
    const { reportRuntimeError } = await import("../src/app/feedback/runtimeErrorReporter")
    for (const message of ["one", "one", "two", "three", "four", "five"]) {
      reportRuntimeError({ kind: "error", error: message })
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each(["synchronous", "asynchronous"])("contains %s transport failures", async (mode) => {
    if (mode === "synchronous") fetchMock.mockImplementation(() => { throw new Error("QA transport unavailable") })
    else fetchMock.mockRejectedValue(new Error("QA transport unavailable"))
    const { reportRuntimeError } = await import("../src/app/feedback/runtimeErrorReporter")
    const { installClientWebVitals } = await import("../src/app/feedback/clientWebVitals")
    expect(() => reportRuntimeError({ kind: "error", error: "Synthetic QA error" })).not.toThrow()
    expect(() => { cleanup = installClientWebVitals() }).not.toThrow()
    windowEvents.dispatchEvent(new Event("pagehide"))
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(beacon).not.toHaveBeenCalled()
  })
})
