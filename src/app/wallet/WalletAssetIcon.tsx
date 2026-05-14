import { useState } from "react"

const WalletAssetIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const candidateKey = `${symbol}:${candidates.join("|")}`
  return <WalletAssetIconInner key={candidateKey} symbol={symbol} candidates={candidates} />
}

const WalletAssetIconInner = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = candidates[index]

  const fallback = (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    />
  )

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        overflow: "hidden"
      }}
    >
      {fallback}
      {!failed && src ? (
        <img
          src={src}
          alt={symbol}
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
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

export default WalletAssetIcon
