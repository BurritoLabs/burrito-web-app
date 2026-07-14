import { useState } from "react"
import styles from "../MarketPairDetails.module.css"

type MarketPairAssetIconProps = {
  candidates: string[]
  size: number
  symbol: string
}

const MarketPairAssetIcon = ({
  symbol,
  candidates,
  size
}: MarketPairAssetIconProps) => {
  const candidateKey = `${symbol}:${candidates.join("|")}`
  return (
    <MarketPairAssetIconInner
      key={candidateKey}
      symbol={symbol}
      candidates={candidates}
      size={size}
    />
  )
}

type MarketPairAssetIconInnerProps = {
  candidates: string[]
  size: number
  symbol: string
}

const MarketPairAssetIconInner = ({
  symbol,
  candidates,
  size
}: MarketPairAssetIconInnerProps) => {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = candidates[index]

  const fallback = (
    <span
      aria-hidden="true"
      className={styles.assetIconFallback}
      style={{ inset: 0, position: "absolute", width: "100%", height: "100%" }}
    />
  )

  return (
    <span
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-flex",
        flex: "0 0 auto"
      }}
    >
      {fallback}
      {!failed && src ? (
      <img
        loading="lazy"
          src={src}
          alt={symbol}
          width={size}
          height={size}
          decoding="async"
          style={{
            inset: 0,
            position: "absolute",
            opacity: loaded ? 1 : 0,
            transition: "opacity 120ms ease"
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            if (index < candidates.length - 1) {
              setIndex((prev) => prev + 1)
            } else {
              setFailed(true)
            }
          }}
        />
      ) : null}
    </span>
  )
}

export default MarketPairAssetIcon
