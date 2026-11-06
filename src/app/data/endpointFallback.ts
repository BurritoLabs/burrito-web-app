import {
  CLASSIC_READ_ENDPOINTS_CONFIG,
  LUNA_READ_ENDPOINTS_CONFIG
} from "../config/chainConfig"
import { throwIfRequestAborted, withRequestDeadline } from "./requestDeadline"

const DEFAULT_READ_TIMEOUT_MS = 8_000
const FALLBACK_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

type FallbackFetchInit = RequestInit & {
  timeoutMs?: number
}

const endpointGroups = [
  CLASSIC_READ_ENDPOINTS_CONFIG.lcd,
  CLASSIC_READ_ENDPOINTS_CONFIG.rpc,
  CLASSIC_READ_ENDPOINTS_CONFIG.fcd,
  LUNA_READ_ENDPOINTS_CONFIG.lcd,
  LUNA_READ_ENDPOINTS_CONFIG.rpc,
  LUNA_READ_ENDPOINTS_CONFIG.fcd
]

const unique = (values: string[]) => Array.from(new Set(values))

const buildFallbackUrls = (url: string) => {
  for (const endpoints of endpointGroups) {
    const matchedBase = endpoints.find((base) => url.startsWith(base))
    if (!matchedBase) continue

    const suffix = url.slice(matchedBase.length)
    const orderedBases = unique([
      matchedBase,
      ...endpoints.filter((base) => base !== matchedBase)
    ])
    return orderedBases.map((base) => `${base}${suffix}`)
  }

  return [url]
}

const shouldFallbackResponse = (response: Response) =>
  FALLBACK_STATUS_CODES.has(response.status)

// A Response escapes this module at headers. Keep caller cancellation connected
// for body readers, but never retain forwarding listeners beyond this attempt's
// deadline. This also works in WebViews without AbortSignal.any().
const createResponseSignal = (
  caller: AbortSignal | null | undefined,
  attempt: AbortSignal,
  timeoutMs: number
) => {
  const controller = new AbortController()
  const cleanup = () => {
    globalThis.clearTimeout(timeoutId)
    caller?.removeEventListener("abort", onCallerAbort)
    attempt.removeEventListener("abort", onAttemptAbort)
  }
  const abort = (reason: unknown) => {
    cleanup()
    if (!controller.signal.aborted) controller.abort(reason)
  }
  const onCallerAbort = () => abort(caller?.reason ?? new DOMException("Request aborted", "AbortError"))
  const onAttemptAbort = () => abort(attempt.reason ?? new DOMException("Request aborted", "AbortError"))
  const timeoutId = globalThis.setTimeout(
    () => abort(new DOMException("Response body deadline exceeded", "TimeoutError")),
    Math.max(0, timeoutMs)
  )
  caller?.addEventListener("abort", onCallerAbort, { once: true })
  attempt.addEventListener("abort", onAttemptAbort, { once: true })
  if (caller?.aborted) onCallerAbort()
  else if (attempt.aborted) onAttemptAbort()
  return { signal: controller.signal, abort }
}

const fetchEndpointResult = async <T>(
  input: string | URL,
  init: FallbackFetchInit,
  consume: (response: Response) => Promise<T>,
  preserveBodyCancellation = false
) => {
  const url = input.toString()
  const urls = buildFallbackUrls(url)
  const { timeoutMs = DEFAULT_READ_TIMEOUT_MS, signal, ...requestInit } = init
  let lastError: unknown
  let lastResponse: T | undefined

  for (const candidate of urls) {
    throwIfRequestAborted(signal)
    try {
      const result = await withRequestDeadline(async (attemptSignal) => {
        const bridge = preserveBodyCancellation
          ? createResponseSignal(signal, attemptSignal, timeoutMs)
          : undefined
        try {
          const response = await fetch(candidate, { ...requestInit, signal: bridge?.signal ?? attemptSignal })
          const value = await consume(response)
          return { value, fallback: shouldFallbackResponse(response) }
        } catch (error) {
          bridge?.abort(error)
          throw error
        }
      }, { signal: signal ?? undefined, timeoutMs })
      if (!result.fallback || candidate === urls[urls.length - 1]) return result.value
      lastResponse = result.value
    } catch (error) {
      throwIfRequestAborted(signal)
      lastError = error
    }
  }

  if (lastResponse) return lastResponse
  throw lastError instanceof Error
    ? lastError
    : new Error("Chain endpoint request failed")
}

// Retain the Response API for existing consumers. Callers reading a body should
// use the JSON variant so the same attempt deadline also covers body consumption.
export const fetchWithEndpointFallback = (
  input: string | URL,
  init: FallbackFetchInit = {}
) => fetchEndpointResult(input, init, async (response) => response, true)

export const fetchJsonWithEndpointFallback = <T>(
  input: string | URL,
  init: FallbackFetchInit = {}
): Promise<{ ok: boolean; status: number; data?: T }> =>
  fetchEndpointResult(input, init, async (response) => ({
    ok: response.ok,
    status: response.status,
    ...(response.ok ? { data: await response.json() as T } : {})
  }))
