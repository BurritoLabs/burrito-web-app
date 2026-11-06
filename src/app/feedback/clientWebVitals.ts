import { getActiveAppChainKey } from "../activeChain"
import { CHAIN_RUNTIME_CONFIG } from "../config/chainConfig"
import {
  BURRITO_MARKET_API_URL,
  BURRITO_REGISTRY_API_URL
} from "../config/externalServices"
import { getDiagnosticsConsent, subscribeDiagnosticsConsent } from "./diagnosticsConsent"

export type ClientVitalName = "CLS" | "FCP" | "INP" | "LCP" | "TTFB"
type ClientVitalRating = "good" | "needs-improvement" | "poor"

type LargestContentfulPaintEntry = PerformanceEntry & { renderTime: number; loadTime: number }
type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean }
type InteractionEntry = PerformanceEntry & { duration: number; interactionId?: number }

const CLIENT_METRIC_ENDPOINT =
  import.meta.env.VITE_CLIENT_METRIC_ENDPOINT?.trim() ||
  `${BURRITO_REGISTRY_API_URL || BURRITO_MARKET_API_URL}/v1/finder/client-metrics`
const thresholds: Record<ClientVitalName, readonly [number, number]> = {
  CLS: [0.1, 0.25],
  FCP: [1_800, 3_000],
  INP: [200, 500],
  LCP: [2_500, 4_000],
  TTFB: [800, 1_800]
}

export const rateClientVital = (
  metric: ClientVitalName,
  value: number
): ClientVitalRating => {
  const [good, poor] = thresholds[metric]
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor"
}

const canCollect = () =>
  import.meta.env.PROD &&
  typeof window !== "undefined" &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  "PerformanceObserver" in window

export const installClientWebVitals = () => {
  if (!canCollect()) return () => undefined

  let disposed = false
  let stopCollection: ((flushPending?: boolean) => void) | undefined

  const startCollection = (includePageLoad: boolean) => {
    if (disposed || stopCollection || !getDiagnosticsConsent()) return
    const startedAt = performance.now()
    const observers: PerformanceObserver[] = []
    const sent = new Set<ClientVitalName>()
    let active = true
    let cls = 0
    let inp = 0
    let lcp = 0
    let navigation: PerformanceNavigationTiming | undefined

    const stop = (flushPending = false) => {
      if (!active) return
      if (flushPending) {
        flush()
        if (!active) return
      }
      active = false
      cls = inp = lcp = 0
      sent.clear()
      observers.forEach((observer) => observer.disconnect())
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pagehide", flush)
      if (stopCollection === stop) stopCollection = undefined
    }
    const isActive = () => {
      if (!active) return false
      if (getDiagnosticsConsent()) return active
      stop()
      return false
    }
    const send = (metric: ClientVitalName, value: number) => {
      if (!isActive() || sent.has(metric) || !Number.isFinite(value) || value < 0) return
      const chainKey = getActiveAppChainKey()
      const payload = JSON.stringify({
        metric,
        value: Number(value.toFixed(metric === "CLS" ? 4 : 0)),
        rating: rateClientVital(metric, value),
        path: window.location.pathname,
        network: CHAIN_RUNTIME_CONFIG[chainKey].chain.chainId,
        navigationType: navigation?.type,
        release: __BURRITO_RELEASE__
      })

      try {
        if (!isActive()) return
        sent.add(metric)
        // Keepalive delivery remains credential-free and consent-gated.
        void fetch(CLIENT_METRIC_ENDPOINT, {
          method: "POST",
          body: payload,
          headers: { "content-type": "application/json" },
          credentials: "omit",
          keepalive: true
        }).catch(() => undefined)
      } catch {
        // Metrics must never affect navigation or transaction flows.
      }
    }
    const observe = (
      type: string,
      callback: (entries: PerformanceEntry[], observer: PerformanceObserver) => void,
      options: PerformanceObserverInit = { type, buffered: includePageLoad }
    ) => {
      if (!isActive()) return
      try {
        const observer = new PerformanceObserver((list, currentObserver) => {
          if (!isActive()) return
          const entries = list.getEntries().filter((entry) =>
            includePageLoad || entry.startTime > startedAt
          )
          callback(entries, currentObserver)
        })
        observers.push(observer)
        observer.observe(options)
      } catch {
        // Older browsers may not support every web-vital entry type.
      }
    }
    const flush = () => {
      if (!isActive()) return
      if (lcp) send("LCP", lcp)
      send("CLS", cls)
      if (inp) send("INP", inp)
    }
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    stopCollection = stop

    // Existing startup consent may include load timing. A later grant never
    // reads historical navigation/paint entries or requests buffered samples.
    if (includePageLoad && isActive()) {
      navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      if (navigation) send("TTFB", navigation.responseStart)
      if (isActive()) {
        const paint = performance.getEntriesByType("paint")
          .find((entry) => entry.name === "first-contentful-paint")
        if (paint) send("FCP", paint.startTime)
      }
    }
    if (!sent.has("FCP")) {
      observe("paint", (entries, observer) => {
        const firstPaint = entries.find((entry) => entry.name === "first-contentful-paint")
        if (!firstPaint) return
        send("FCP", firstPaint.startTime)
        observer.disconnect()
      })
    }
    observe("largest-contentful-paint", (entries) => {
      const latest = entries.at(-1) as LargestContentfulPaintEntry | undefined
      if (latest) lcp = latest.renderTime || latest.loadTime || latest.startTime
    })
    observe("layout-shift", (entries) => {
      for (const entry of entries as LayoutShiftEntry[]) {
        if (!entry.hadRecentInput) cls += entry.value
      }
    })
    observe("event", (entries) => {
      for (const entry of entries as InteractionEntry[]) {
        if (entry.interactionId) inp = Math.max(inp, entry.duration)
      }
    }, { type: "event", buffered: includePageLoad, durationThreshold: 40 } as PerformanceObserverInit)
    if (isActive()) {
      document.addEventListener("visibilitychange", handleVisibility)
      window.addEventListener("pagehide", flush)
    }
  }

  const initiallyGranted = getDiagnosticsConsent()
  const unsubscribe = subscribeDiagnosticsConsent(() => {
    if (getDiagnosticsConsent()) startCollection(false)
    else stopCollection?.() // Withdrawal discards samples; never flush it.
  })
  if (initiallyGranted) startCollection(true)

  return () => {
    if (disposed) return
    unsubscribe()
    stopCollection?.(true)
    disposed = true
  }
}
