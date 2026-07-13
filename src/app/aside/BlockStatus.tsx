import { useQuery } from "@tanstack/react-query"
import styles from "./Aside.module.css"
import { useAppChain } from "../appChainContext"
import { getBlockExplorerUrl } from "../explorer"
import { fetchLatestBlock } from "./blockStatusData"

const BLOCK_REFRESH_MS = 6_000
const LIVE_BLOCK_MAX_AGE_MS = 30_000
const STALE_BLOCK_MAX_AGE_MS = 90_000

const BlockStatus = () => {
  const { chain, chainKey } = useAppChain()
  const lcd = chain.runtime.chain.lcd
  const { data: latestBlock, isError } = useQuery({
    queryKey: ["latest-block-height", chain.chainId],
    queryFn: () => fetchLatestBlock(lcd),
    refetchInterval: BLOCK_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: BLOCK_REFRESH_MS - 1_000,
    retry: false
  })

  const blockAgeMs =
    latestBlock?.timeMs && Number.isFinite(latestBlock.timeMs)
      ? Math.max(0, latestBlock.fetchedAt - latestBlock.timeMs)
      : Number.POSITIVE_INFINITY
  const status = isError
    ? "offline"
    : !latestBlock
      ? "checking"
      : blockAgeMs <= LIVE_BLOCK_MAX_AGE_MS
        ? "live"
        : blockAgeMs <= STALE_BLOCK_MAX_AGE_MS
          ? "stale"
          : "offline"
  const statusLabel =
    status === "live"
      ? "Live"
      : status === "stale"
        ? "Stale"
        : status === "offline"
          ? "Offline"
          : "Checking"
  const dotClass =
    status === "live"
      ? styles.blockDotLive
      : status === "stale"
        ? styles.blockDotStale
        : status === "offline"
          ? styles.blockDotOffline
          : styles.blockDotChecking
  const title = latestBlock
    ? `${statusLabel}: block ${latestBlock.height.toLocaleString()} · ${Math.round(
        blockAgeMs / 1_000
      )}s old · LCD: ${latestBlock.endpoint}`
    : `${statusLabel}: LCD ${lcd}`
  const height = latestBlock?.height

  return (
    <div
      className={styles.blockStatus}
      title={title}
      aria-label={title}
    >
      <span
        className={`${styles.blockDot} ${dotClass}`}
        aria-hidden="true"
      />
      {height ? (
        <a
          className={styles.blockHeight}
          href={getBlockExplorerUrl(chainKey, height)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open block ${height}`}
        >
          {height.toLocaleString()}
        </a>
      ) : (
        <span className={styles.blockHeight}>Loading...</span>
      )}
    </div>
  )
}

export default BlockStatus
