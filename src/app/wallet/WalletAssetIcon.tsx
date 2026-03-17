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
  const [failed, setFailed] = useState(false)

  if (failed || !candidates.length) {
    return <span>{symbol.slice(0, 1)}</span>
  }

  return (
    <img
      src={candidates[index]}
      alt={symbol}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex(index + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

export default WalletAssetIcon
