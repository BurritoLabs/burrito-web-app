import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchPrices, refreshPrices, type PriceMap } from "../data/prices"
import { useAppChain } from "../appChainContext"
import type { AppChainKey } from "../appChains"
import styles from "./PriceStatusNotice.module.css"

const PRICE_STATUS_MAX_AGE_MS = 5 * 60 * 1000

type PriceStatusModel = {
  kind: "unavailable" | "delayed"
  asOf?: number
}

const getPriceStatusModel = (
  data: PriceMap | undefined,
  hasError: boolean,
  updatedAt: number,
  now: number,
  chainKey: AppChainKey
): PriceStatusModel | undefined => {
  if (!data) return hasError ? { kind: "unavailable" } : undefined

  const asOf = data._meta?.asOf ?? (updatedAt > 0 ? updatedAt : undefined)
  const activePriceMissing = chainKey === "luna"
    ? !data.luna
    : !data.lunc || !data.ustc
  if (activePriceMissing) return { kind: "unavailable", asOf }

  const isOld = data._meta?.stale === true || (
    asOf !== undefined && now - asOf >= PRICE_STATUS_MAX_AGE_MS
  )

  return hasError || isOld ? { kind: "delayed", asOf } : undefined
}

const formatTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp)

const PriceStatusNotice = () => {
  const { chain, chainKey } = useAppChain()
  const queryClient = useQueryClient()
  const queryKey = ["prices", chain.chainId] as const
  const pricesQuery = useQuery<PriceMap>({
    queryKey,
    queryFn: fetchPrices,
    enabled: false
  })
  const [now, setNow] = useState(() => Date.now())
  const sourceAsOf = pricesQuery.data?._meta?.asOf ?? (
    pricesQuery.dataUpdatedAt > 0 ? pricesQuery.dataUpdatedAt : undefined
  )
  const model = getPriceStatusModel(
    pricesQuery.data,
    pricesQuery.isError,
    pricesQuery.dataUpdatedAt,
    now,
    chainKey
  )

  useEffect(() => {
    if (!pricesQuery.data || pricesQuery.data._meta?.stale || sourceAsOf === undefined) return
    const delay = sourceAsOf + PRICE_STATUS_MAX_AGE_MS - Date.now() + 1
    if (delay <= 0) {
      setNow(Date.now())
      return
    }
    const timer = globalThis.setTimeout(() => setNow(Date.now()), delay)
    return () => globalThis.clearTimeout(timer)
  }, [sourceAsOf, pricesQuery.data, pricesQuery.data?._meta?.stale])

  if (!model) return null

  const isRefreshing = pricesQuery.isFetching
  const retry = () => {
    void queryClient.fetchQuery({
      queryKey,
      queryFn: refreshPrices,
      staleTime: 0
    }).catch(() => undefined)
  }

  return (
    <aside className={styles.notice} role="status" aria-live="polite">
      <span className={styles.message}>
        {model.kind === "unavailable" ? (
          <>
            Price estimates are unavailable. Token balances are unchanged. Price
            estimates are not execution quotes.
          </>
        ) : (
          <>
            Price estimates are delayed.
            {model.asOf !== undefined ? (
              <span className={styles.timestamp}> Last updated {formatTimestamp(model.asOf)}.</span>
            ) : null}{" "}
            These are estimates, not execution quotes.
          </>
        )}
      </span>
      <button
        className={styles.retry}
        type="button"
        onClick={retry}
        disabled={isRefreshing}
      >
        {isRefreshing ? "Refreshing…" : "Retry"}
      </button>
    </aside>
  )
}

export default PriceStatusNotice
