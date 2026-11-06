// Avoid requiring AbortSignal.throwIfAborted in embedded browser runtimes.
export const throwIfRequestAborted = (signal?: AbortSignal | null): void => {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Request aborted", "AbortError")
  }
}

/** A deadline must cover consumption as well as headers, even for transports
 * which ignore AbortSignal. Reject explicitly and abort the underlying work. */
export const withRequestDeadline = <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number }
): Promise<T> => new Promise<T>((resolve, reject) => {
  if (signal?.aborted) {
    reject(signal.reason ?? new DOMException("Request aborted", "AbortError"))
    return
  }

  const controller = new AbortController()
  let settled = false
  const cleanup = () => {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", onAbort)
  }
  const fail = (reason: unknown) => {
    if (settled) return
    settled = true
    cleanup()
    controller.abort(reason)
    reject(reason)
  }
  const onAbort = () => fail(signal?.reason ?? new DOMException("Request aborted", "AbortError"))
  signal?.addEventListener("abort", onAbort, { once: true })
  const timeoutId = globalThis.setTimeout(
    () => fail(new DOMException("Request deadline exceeded", "TimeoutError")),
    Math.max(0, timeoutMs)
  )

  try {
    operation(controller.signal).then((value) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }, fail)
  } catch (error) {
    fail(error)
  }
})
