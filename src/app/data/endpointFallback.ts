import { CLASSIC_READ_ENDPOINTS_CONFIG } from "../config/chainConfig"

const DEFAULT_READ_TIMEOUT_MS = 8_000
const FALLBACK_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

type FallbackFetchInit = RequestInit & {
  timeoutMs?: number
}

const endpointGroups = [
  CLASSIC_READ_ENDPOINTS_CONFIG.lcd,
  CLASSIC_READ_ENDPOINTS_CONFIG.rpc,
  CLASSIC_READ_ENDPOINTS_CONFIG.fcd
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

export const fetchWithEndpointFallback = async (
  input: string | URL,
  init: FallbackFetchInit = {}
) => {
  const url = input.toString()
  const urls = buildFallbackUrls(url)
  const { timeoutMs = DEFAULT_READ_TIMEOUT_MS, signal, ...requestInit } = init
  let lastError: unknown
  let lastResponse: Response | undefined

  for (const candidate of urls) {
    const controller =
      signal || typeof AbortController === "undefined"
        ? undefined
        : new AbortController()
    const timeoutId = controller
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : undefined

    try {
      const response = await fetch(candidate, {
        ...requestInit,
        signal: signal ?? controller?.signal
      })

      if (!shouldFallbackResponse(response) || candidate === urls[urls.length - 1]) {
        return response
      }

      lastResponse = response
    } catch (error) {
      lastError = error
    } finally {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId)
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError instanceof Error
    ? lastError
    : new Error("Classic endpoint request failed")
}
