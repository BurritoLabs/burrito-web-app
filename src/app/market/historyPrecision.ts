// A disabled query can still return cached data. Unknown units must not reuse
// the cache key for legitimate zero-decimal assets.
export const marketHistoryPrecisionKey = (ready: boolean, left?: number, right?: number) =>
  ready ? [left, right] as const : ["precision-unavailable"] as const
