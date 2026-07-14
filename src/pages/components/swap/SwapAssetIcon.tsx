import { useState } from "react"
import styles from "../../Swap.module.css"

type SwapAssetIconProps = {
  symbol: string
  candidates: string[]
  size?: number
}

const SwapAssetIcon = ({
  symbol,
  candidates,
  size = 20
}: SwapAssetIconProps) => {
  const candidateKey = `${symbol}:${candidates.join("|")}`
  return (
    <SwapAssetIconInner
      key={candidateKey}
      symbol={symbol}
      candidates={candidates}
      size={size}
    />
  )
}

type SwapAssetIconInnerProps = {
  symbol: string
  candidates: string[]
  size: number
}

const SwapAssetIconInner = ({
  symbol,
  candidates,
  size
}: SwapAssetIconInnerProps) => {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = candidates[index]

  const showFallback = failed || !src || !loaded
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
      {showFallback ? fallback : null}
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
            borderRadius: "50%",
            objectFit: "cover",
            display: "block",
            opacity: loaded ? 1 : 0,
            transition: "opacity 120ms ease"
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            if (index < candidates.length - 1) {
              setIndex(index + 1)
            } else {
              setFailed(true)
            }
          }}
        />
      ) : null}
    </span>
  )
}

export default SwapAssetIcon
