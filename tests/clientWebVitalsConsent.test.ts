import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const key = "burrito:diagnostics-consent:v1"
type Sample = Partial<PerformanceEntry> & Record<string, unknown>

describe("consent-scoped web vitals", () => {
  let cleanup: (() => void) | undefined
  let values: Map<string, string>
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> }
  let windowEvents: EventTarget
  let documentEvents: EventTarget
  let fetchMock: ReturnType<typeof vi.fn>
  let entries: ReturnType<typeof vi.fn>
  let now: number
  let observers: Observer[]
  let consent: typeof import("../src/app/feedback/diagnosticsConsent")
  let install: typeof import("../src/app/feedback/clientWebVitals")["installClientWebVitals"]

  class Observer {
    options?: PerformanceObserverInit
    disconnect = vi.fn()
    constructor(readonly callback: PerformanceObserverCallback) { observers.push(this) }
    observe(options: PerformanceObserverInit) { this.options = options }
    emit(samples: Sample[]) {
      this.callback({ getEntries: () => samples } as unknown as PerformanceObserverEntryList, this as unknown as PerformanceObserver)
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv("PROD", true)
    vi.stubEnv("VITE_CLIENT_METRIC_ENDPOINT", "https://diagnostics.example.test/metrics")
    values = new Map()
    storage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => { values.set(name, value) })
    }
    now = 100
    observers = []
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    entries = vi.fn((type: string) => type === "navigation"
      ? [{ responseStart: 75, type: "navigate" }]
      : [{ name: "first-contentful-paint", startTime: 50 }])
    windowEvents = Object.assign(new EventTarget(), {
      localStorage: storage,
      location: { hostname: "wallet.example.test", pathname: "/privacy" },
      PerformanceObserver: Observer
    })
    documentEvents = Object.assign(new EventTarget(), { visibilityState: "hidden" })
    vi.stubGlobal("window", windowEvents)
    vi.stubGlobal("document", documentEvents)
    vi.stubGlobal("PerformanceObserver", Observer)
    vi.stubGlobal("performance", { now: () => now, getEntriesByType: entries })
    vi.stubGlobal("fetch", fetchMock)
    consent = await import("../src/app/feedback/diagnosticsConsent")
    install = (await import("../src/app/feedback/clientWebVitals")).installClientWebVitals
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const emit = (type: string, samples: Sample[], pool = observers) => {
    pool.find((observer) => observer.options?.type === type)?.emit(samples)
  }
  const payloads = () => fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))
  const storageEvent = () => windowEvents.dispatchEvent(Object.assign(new Event("storage"), { key, storageArea: storage }))

  it("does not read timing history, create observers or report before opt-in", () => {
    const windowAdd = vi.spyOn(windowEvents, "addEventListener")
    const documentAdd = vi.spyOn(documentEvents, "addEventListener")
    cleanup = install()
    expect(observers).toHaveLength(0)
    expect(entries).not.toHaveBeenCalled()
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd.mock.calls.map(([type]) => type)).toEqual(["storage"])
    documentEvents.dispatchEvent(new Event("visibilitychange"))
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("may measure buffered load entries only with existing consent at installation", () => {
    values.set(key, "granted")
    cleanup = install()
    expect(payloads().map((item) => [item.metric, item.value])).toEqual([["TTFB", 75], ["FCP", 50]])
    expect(observers).toHaveLength(3)
    expect(observers.every((observer) => observer.options?.buffered === true)).toBe(true)
  })

  it("late opt-in never reads navigation/paint history and ignores old entry timestamps", () => {
    cleanup = install()
    expect(consent.setDiagnosticsConsent(true)).toBe(true)
    expect(entries).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(observers.every((observer) => observer.options?.buffered === false)).toBe(true)
    emit("paint", [{ name: "first-contentful-paint", startTime: 50 }])
    emit("largest-contentful-paint", [{ startTime: 50, renderTime: 50 }, { startTime: 250, renderTime: 250 }])
    emit("layout-shift", [{ startTime: 50, value: 1 }, { startTime: 100, value: 1 }, { startTime: 260, value: 0.05 }])
    emit("event", [{ startTime: 50, interactionId: 1, duration: 900 }, { startTime: 270, interactionId: 2, duration: 200 }])
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(payloads().map((item) => [item.metric, item.value])).toEqual([["LCP", 250], ["CLS", 0.05], ["INP", 200]])
    expect(payloads().every((item) => !Object.hasOwn(item, "navigationType"))).toBe(true)
  })

  it("withdrawal discards samples without flush and old queued callbacks stay inert after regrant", () => {
    values.set(key, "granted")
    cleanup = install()
    const oldObservers = [...observers]
    emit("largest-contentful-paint", [{ startTime: 300, renderTime: 300 }])
    emit("layout-shift", [{ startTime: 300, value: 0.6 }])
    emit("event", [{ startTime: 300, interactionId: 1, duration: 800 }])
    fetchMock.mockClear()
    expect(consent.setDiagnosticsConsent(false)).toBe(true)
    expect(oldObservers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true)
    documentEvents.dispatchEvent(new Event("visibilitychange"))
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).not.toHaveBeenCalled()
    now = 1_000
    consent.setDiagnosticsConsent(true)
    const fresh = observers.slice(oldObservers.length)
    emit("largest-contentful-paint", [{ startTime: 1_200, renderTime: 1_200 }], oldObservers)
    emit("layout-shift", [{ startTime: 1_200, value: 0.9 }], oldObservers)
    emit("event", [{ startTime: 1_200, interactionId: 2, duration: 900 }], oldObservers)
    emit("layout-shift", [{ startTime: 500, value: 0.5 }, { startTime: 1_300, value: 0.1 }], fresh)
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(payloads().map((item) => [item.metric, item.value])).toEqual([["CLS", 0.1]])
    expect(fresh.every((observer) => observer.options?.buffered === false)).toBe(true)
  })

  it("handles cross-tab withdrawal and regrant with fresh observers", () => {
    values.set(key, "granted")
    cleanup = install()
    const oldObservers = [...observers]
    fetchMock.mockClear()
    values.delete(key)
    storageEvent()
    expect(oldObservers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true)
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).not.toHaveBeenCalled()
    now = 2_000
    values.set(key, "granted")
    storageEvent()
    expect(observers.length).toBeGreaterThan(oldObservers.length)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(entries).toHaveBeenCalledTimes(2)
  })

  it("failed withdrawal stops collection even while the old storage grant remains", () => {
    values.set(key, "granted")
    cleanup = install()
    fetchMock.mockClear()
    storage.setItem.mockImplementationOnce(() => { throw new Error("Storage unavailable") })
    expect(consent.setDiagnosticsConsent(false)).toBe(false)
    expect(values.get(key)).toBe("granted")
    emit("layout-shift", [{ startTime: 250, value: 0.5 }])
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a storage read failure drops queued samples and remains off after storage recovers", () => {
    values.set(key, "granted")
    cleanup = install()
    fetchMock.mockClear()
    storage.getItem.mockImplementationOnce(() => { throw new Error("Storage unavailable") })
    emit("layout-shift", [{ startTime: 250, value: 0.5 }])
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true)
    expect(consent.getDiagnosticsConsent()).toBe(false)
  })

  it("checks consent again between individual sends without requiring a storage event", () => {
    values.set(key, "granted")
    fetchMock.mockImplementationOnce(() => {
      values.set(key, "denied")
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    cleanup = install()
    expect(payloads().map((item) => item.metric)).toEqual(["TTFB"])
    windowEvents.dispatchEvent(new Event("pagehide"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
