import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"
import { fetchWithEndpointFallback } from "../data/endpointFallback"
import styles from "./Aside.module.css"
import { useAppChain } from "../appChainContext"
import { getBlockExplorerUrl } from "../explorer"

const BLOCK_REFRESH_MS = 6_000
const LIVE_BLOCK_MAX_AGE_MS = 30_000
const STALE_BLOCK_MAX_AGE_MS = 90_000

type LatestBlock = {
  endpoint: string
  fetchedAt: number
  height: number
  timeMs: number
}

const fetchLatestBlock = async (): Promise<LatestBlock> => {
  const response = await fetchWithEndpointFallback(
    `${CLASSIC_CHAIN.lcd}/cosmos/base/tendermint/v1beta1/blocks/latest`
  )
  if (!response.ok) {
    throw new Error("Failed to fetch latest block")
  }
  const data = (await response.json()) as {
    block?: { header?: { height?: string; time?: string } }
  }
  const height = Number(data?.block?.header?.height)
  if (!Number.isFinite(height)) {
    throw new Error("Invalid block height")
  }

  const timeMs = Date.parse(data?.block?.header?.time ?? "")
  if (!Number.isFinite(timeMs)) {
    throw new Error("Invalid block time")
  }

  return {
    endpoint: response.url || CLASSIC_CHAIN.lcd,
    fetchedAt: Date.now(),
    height,
    timeMs
  }
}

const BlockStatus = () => {
  const { chain, chainKey } = useAppChain()
  const { data: latestBlock, isError } = useQuery({
    queryKey: ["latest-block-height", chain.chainId],
    queryFn: fetchLatestBlock,
    refetchInterval: BLOCK_REFRESH_MS,
    refetchIntervalInBackground: true,
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
    : `${statusLabel}: LCD ${CLASSIC_CHAIN.lcd}`
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
