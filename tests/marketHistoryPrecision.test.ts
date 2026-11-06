import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { marketHistoryPrecisionKey } from "../src/app/market/historyPrecision"

describe("market history precision cache boundary", () => {
  it.each(["pair-trades", "pair-trader-stats", "pair-candles"])("isolates unknown units from cached legitimate zero for %s", kind => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const key = (ready: boolean, decimals = 0) => ["market", "chain", kind, "pair", "left", "right",
      ...marketHistoryPrecisionKey(ready, decimals, 6)]
    const cached = [{ timestamp: 1, value: 123 }]
    client.setQueryData(key(true), cached)
    const queryFn = vi.fn(async () => cached)
    const observer = new QueryObserver(client, { queryKey: key(true), queryFn, enabled: false })
    const unsubscribe = observer.subscribe(() => {})
    try {
      expect(observer.getCurrentResult().data).toEqual(cached)
      // Disabling alone retains data. Losing precision switches cache identity.
      observer.setOptions({ queryKey: key(false), queryFn, enabled: false })
      expect(observer.getCurrentResult().data).toBeUndefined()
      expect(queryFn).not.toHaveBeenCalled()
      observer.setOptions({ queryKey: key(true), queryFn, enabled: false })
      expect(observer.getCurrentResult().data).toEqual(cached)
      observer.setOptions({ queryKey: key(true, 8), queryFn, enabled: false })
      expect(observer.getCurrentResult().data).toBeUndefined()
    } finally {
      unsubscribe()
      client.clear()
    }
  })
})
