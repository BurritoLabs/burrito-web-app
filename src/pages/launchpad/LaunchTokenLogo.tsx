import { useState } from "react"
import styles from "../Launchpad.module.css"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates
} from "../../app/utils/assetIcons"

const luncIconCandidates = buildClassicNativeIconCandidates({
  denom: "uluna",
  symbol: "LUNC"
})

const LaunchTokenLogoInner = ({
  candidates
}: {
  candidates: string[]
}) => {
  const candidateKey = candidates.join("|")
  return <LaunchTokenLogoImage key={candidateKey} candidates={candidates} />
}

const LaunchTokenLogoImage = ({
  candidates
}: {
  candidates: string[]
}) => {
  const [index, setIndex] = useState(0)
  const icon = candidates[index]

  return (
    <div className={styles.launchLogo}>
      <img
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        src={icon}
        onError={() => {
          if (index < candidates.length - 1) {
            setIndex((current) => current + 1)
          }
        }}
      />
    </div>
  )
}

const LaunchTokenLogo = ({
  symbol,
  logoUrl,
  pairedWithLunc = false
}: {
  symbol: string
  logoUrl?: string | null
  pairedWithLunc?: boolean
}) => {
  const candidates = buildCw20IconCandidates(logoUrl ?? undefined, symbol)
  if (pairedWithLunc) {
    return (
      <div className={styles.launchPairLogo}>
        <span className={styles.launchPairPrimary}>
          <LaunchTokenLogoInner candidates={candidates} />
        </span>
        <span className={styles.launchPairSecondary}>
          <LaunchTokenLogoInner candidates={luncIconCandidates} />
        </span>
      </div>
    )
  }

  return <LaunchTokenLogoInner candidates={candidates} />
}

export default LaunchTokenLogo
