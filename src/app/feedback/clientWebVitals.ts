import { getActiveAppChainKey } from "../activeChain"
import { CHAIN_RUNTIME_CONFIG } from "../config/chainConfig"
import {
  BURRITO_MARKET_API_URL,
  BURRITO_REGISTRY_API_URL
} from "../config/externalServices"

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

  const observers: PerformanceObserver[] = []
  const sent = new Set<ClientVitalName>()
  let cls = 0
  let inp = 0
  let lcp = 0

  const send = (metric: ClientVitalName, value: number) => {
    if (sent.has(metric) || !Number.isFinite(value) || value < 0) return
    sent.add(metric)
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
      if (
        navigator.sendBeacon?.(
          CLIENT_METRIC_ENDPOINT,
          new Blob([payload], { type: "application/json" })
        )
      ) {
        return
      }
      void fetch(CLIENT_METRIC_ENDPOINT, {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/json" },
        keepalive: true
      }).catch(() => undefined)
    } catch {
      // Metrics must never affect navigation or transaction flows.
    }
  }

  const observe = (
    type: string,
    callback: PerformanceObserverCallback,
    options: PerformanceObserverInit = { type, buffered: true }
  ) => {
    try {
      const observer = new PerformanceObserver(callback)
      observer.observe(options)
      observers.push(observer)
    } catch {
      // Older browsers may not support every web-vital entry type.
    }
  }

  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined
  if (navigation) send("TTFB", navigation.responseStart)

  const paint = performance
    .getEntriesByType("paint")
    .find((entry) => entry.name === "first-contentful-paint")
  if (paint) send("FCP", paint.startTime)
  else {
    observe("paint", (list, observer) => {
      const firstPaint = list.getEntries().find((entry) => entry.name === "first-contentful-paint")
      if (!firstPaint) return
      send("FCP", firstPaint.startTime)
      observer.disconnect()
    })
  }

  observe("largest-contentful-paint", (list) => {
    const entries = list.getEntries() as LargestContentfulPaintEntry[]
    const latest = entries.at(-1)
    if (latest) lcp = latest.renderTime || latest.loadTime || latest.startTime
  })
  observe("layout-shift", (list) => {
    for (const entry of list.getEntries() as LayoutShiftEntry[]) {
      if (!entry.hadRecentInput) cls += entry.value
    }
  })
  observe("event", (list) => {
    for (const entry of list.getEntries() as InteractionEntry[]) {
      if (entry.interactionId) inp = Math.max(inp, entry.duration)
    }
  }, { type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit)

  const flush = () => {
    if (lcp) send("LCP", lcp)
    send("CLS", cls)
    if (inp) send("INP", inp)
  }
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") flush()
  }
  document.addEventListener("visibilitychange", handleVisibility)
  window.addEventListener("pagehide", flush)

  return () => {
    flush()
    observers.forEach((observer) => observer.disconnect())
    document.removeEventListener("visibilitychange", handleVisibility)
    window.removeEventListener("pagehide", flush)
  }
}
