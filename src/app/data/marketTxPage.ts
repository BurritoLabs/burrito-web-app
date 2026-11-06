import { fetchJsonWithEndpointFallback } from "./endpointFallback"
import { throwIfRequestAborted } from "./requestDeadline"

type Page = { tx_responses?: unknown[] }
type Result = { ok: boolean; status: number; data?: Page }
type Entry = { controller: AbortController; promise: Promise<Result>; users: number; done: boolean }
// Share only overlapping reads. Completed pages must not be reused alongside
// newer offset pages: new trades can move a transaction across page boundaries.
const inFlightPages = new Map<string, Entry>()
const MAX_IN_FLIGHT_PAGES = 24

export const fetchMarketTxPage = <T extends Page>(
  chainId: string, url: URL, timeoutMs: number, signal: AbortSignal
): Promise<{ ok: boolean; status: number; data?: T }> => {
  throwIfRequestAborted(signal)
  const key = JSON.stringify([chainId, url.href, timeoutMs])
  let entry = inFlightPages.get(key)
  if (!entry) {
    // Never evict/abort a live consumer to admit another key. If every slot is
    // active, this request simply runs independently and is not retained.
    const controller = new AbortController()
    const created: Entry = { controller, users: 0, done: false,
      promise: fetchJsonWithEndpointFallback<Page>(url, { timeoutMs, signal: controller.signal }) }
    const remove = () => {
      created.done = true
      if (inFlightPages.get(key) === created) inFlightPages.delete(key)
    }
    created.promise = created.promise.then(result => { remove(); return result },
      error => { remove(); throw error })
    if (inFlightPages.size < MAX_IN_FLIGHT_PAGES) inFlightPages.set(key, created)
    entry = created
  }
  const shared = entry
  shared.users++
  return new Promise((resolve, reject) => {
    let active = true
    const release = () => {
      if (!active) return false
      active = false
      signal.removeEventListener("abort", onAbort)
      shared.users--
      if (!shared.done && shared.users === 0) {
        if (inFlightPages.get(key) === shared) inFlightPages.delete(key)
        shared.controller.abort()
      }
      return true
    }
    const onAbort = () => { if (release()) reject(signal.reason ?? new DOMException("Request aborted", "AbortError")) }
    signal.addEventListener("abort", onAbort, { once: true })
    shared.promise.then(result => { if (release()) resolve(result as { ok: boolean; status: number; data?: T }) },
      error => { if (release()) reject(error) })
    if (signal.aborted) onAbort()
  })
}
