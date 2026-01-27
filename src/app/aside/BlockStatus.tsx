import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"
import styles from "./Aside.module.css"

const fetchLatestHeight = async () => {
  const response = await fetch(
    `${CLASSIC_CHAIN.lcd}/cosmos/base/tendermint/v1beta1/blocks/latest`
  )
  if (!response.ok) {
    throw new Error("Failed to fetch latest block")
  }
  const data = (await response.json()) as {
    block?: { header?: { height?: string } }
  }
  const height = Number(data?.block?.header?.height)
  if (!Number.isFinite(height)) {
    throw new Error("Invalid block height")
  }
  return height
}

const BlockStatus = () => {
  const { data: height, isError } = useQuery({
    queryKey: ["latest-block-height"],
    queryFn: fetchLatestHeight,
    refetchInterval: 1000,
    staleTime: 0,
    retry: false
  })

  return (
    <div
      className={styles.blockStatus}
      title={`LCD: ${CLASSIC_CHAIN.lcd}`}
      aria-label={`LCD: ${CLASSIC_CHAIN.lcd}`}
    >
      <span
        className={`${styles.blockDot} ${
          isError ? styles.blockDotOffline : styles.blockDotLive
        }`}
        aria-hidden="true"
      />
      {height ? (
        <a
          className={styles.blockHeight}
          href={`https://finder.burrito.money/classic/blocks/${height}`}
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
