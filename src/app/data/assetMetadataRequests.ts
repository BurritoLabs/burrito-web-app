const inFlightRequests = new Map<string, Promise<unknown>>()

export const withInFlightAssetRequest = <T,>(
  chainId: string,
  assetKey: string,
  request: () => Promise<T>
): Promise<T> => {
  const key = `${chainId}\u0000${assetKey}`
  const pending = inFlightRequests.get(key) as Promise<T> | undefined
  if (pending) return pending

  const promise = Promise.resolve().then(request)
  inFlightRequests.set(key, promise)
  const clear = () => {
    if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key)
  }
  void promise.then(clear, clear)
  return promise
}

export type SettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown }

export const mapSettledWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<Array<SettledResult<R>>> => {
  const results = new Array<SettledResult<R>>(items.length)
  let nextIndex = 0
  const concurrency = Math.max(1, Math.floor(limit) || 1)
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        try {
          results[index] = { status: "fulfilled", value: await mapper(items[index], index) }
        } catch (reason) {
          results[index] = { status: "rejected", reason }
        }
      }
    }
  )
  await Promise.all(workers)
  return results
}
