import { getActiveAppChainKey } from "../activeChain"
import { CHAIN_RUNTIME_CONFIG } from "../config/chainConfig"
import { BURRITO_REGISTRY_API_URL } from "../config/externalServices"

export type RuntimeErrorKind = "error" | "unhandledrejection" | "react" | "fetch"

type RuntimeErrorReport = {
  kind: RuntimeErrorKind
  error: unknown
  componentStack?: string
}

const CLIENT_ERROR_ENDPOINT =
  import.meta.env.VITE_CLIENT_ERROR_ENDPOINT?.trim() ||
  (BURRITO_REGISTRY_API_URL
    ? `${BURRITO_REGISTRY_API_URL}/v1/finder/client-errors`
    : "")
const REPORT_WINDOW_MS = 60_000
const MAX_REPORTS_PER_WINDOW = 4
const DUPLICATE_WINDOW_MS = 30_000
const recentFingerprints = new Map<string, number>()
let reportWindowStartedAt = 0
let reportsInWindow = 0

export const sanitizeClientErrorText = (value: string, maxLength: number) =>
  value
    .replace(
      /terravaloper1[023456789acdefghjklmnpqrstuvwxyz]{38,90}/gi,
      "<validator_address>"
    )
    .replace(
      /terra1[023456789acdefghjklmnpqrstuvwxyz]{38,90}/gi,
      "<terra_address>"
    )
    .replace(/[A-Fa-f0-9]{64}/g, "<hash>")
    .replace(/[A-Za-z0-9+/_=-]{200,}/g, "<encoded_value>")
    .slice(0, maxLength)

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown runtime error",
      stack: error.stack
    }
  }
  if (typeof error === "string" && error.trim()) {
    return { message: error }
  }
  try {
    return { message: JSON.stringify(error) || "Unknown runtime error" }
  } catch {
    return { message: "Unknown runtime error" }
  }
}

const canReport = (fingerprint: string) => {
  const now = Date.now()
  if (!reportWindowStartedAt || now - reportWindowStartedAt >= REPORT_WINDOW_MS) {
    reportWindowStartedAt = now
    reportsInWindow = 0
  }

  const lastReportedAt = recentFingerprints.get(fingerprint)
  if (lastReportedAt && now - lastReportedAt < DUPLICATE_WINDOW_MS) return false
  if (reportsInWindow >= MAX_REPORTS_PER_WINDOW) return false

  reportsInWindow += 1
  recentFingerprints.set(fingerprint, now)
  for (const [key, reportedAt] of recentFingerprints) {
    if (now - reportedAt >= DUPLICATE_WINDOW_MS) recentFingerprints.delete(key)
  }
  return true
}

export const reportRuntimeError = ({
  kind,
  error,
  componentStack
}: RuntimeErrorReport) => {
  if (!CLIENT_ERROR_ENDPOINT || typeof window === "undefined") return

  const normalized = normalizeError(error)
  const message = sanitizeClientErrorText(normalized.message, 1_000)
  const stack = normalized.stack
    ? sanitizeClientErrorText(normalized.stack, 8_000)
    : undefined
  const safeComponentStack = componentStack
    ? sanitizeClientErrorText(componentStack, 8_000)
    : undefined
  const fingerprint = `${kind}:${message}:${safeComponentStack ?? ""}`
  if (!message || !canReport(fingerprint)) return

  const chainKey = getActiveAppChainKey()
  const payload = JSON.stringify({
    kind,
    message,
    stack,
    componentStack: safeComponentStack,
    url: `${window.location.origin}${window.location.pathname}`,
    network: CHAIN_RUNTIME_CONFIG[chainKey].chain.chainId,
    userAgent: window.navigator.userAgent.slice(0, 500)
  })

  try {
    if (typeof window.navigator.sendBeacon === "function") {
      const accepted = window.navigator.sendBeacon(
        CLIENT_ERROR_ENDPOINT,
        new Blob([payload], { type: "application/json" })
      )
      if (accepted) return
    }

    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      keepalive: true
    }).catch(() => undefined)
  } catch {
    // Observability must never affect the application or transaction flow.
  }
}

export const installRuntimeErrorReporting = () => {
  if (typeof window === "undefined") return () => undefined

  const handleError = (event: ErrorEvent) => {
    reportRuntimeError({
      kind: "error",
      error: event.error ?? event.message
    })
  }
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportRuntimeError({
      kind: "unhandledrejection",
      error: event.reason
    })
  }

  window.addEventListener("error", handleError)
  window.addEventListener("unhandledrejection", handleUnhandledRejection)
  return () => {
    window.removeEventListener("error", handleError)
    window.removeEventListener("unhandledrejection", handleUnhandledRejection)
  }
}
