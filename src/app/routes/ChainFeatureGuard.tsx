import type { ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import PageShell from "../../pages/PageShell"
import { useAppChain } from "../appChainContext"
import { SUPPORTED_APP_CHAINS } from "../appChains"
import {
  findAlternativeChainForFeature,
  type ChainFeature
} from "./chainFeatureAvailability"
import { getChainSwitchDestination } from "./chainSwitchNavigation"
import styles from "./ChainFeatureGuard.module.css"

type ChainFeatureGuardProps = {
  children: ReactNode
  feature: ChainFeature
  title: string
}

const ChainFeatureGuard = ({
  children,
  feature,
  title
}: ChainFeatureGuardProps) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { chain, chainKey, setChainKey } = useAppChain()

  if (chain.features[feature]) return children

  const alternativeChain = findAlternativeChainForFeature(
    SUPPORTED_APP_CHAINS,
    chainKey,
    feature
  )

  return (
    <PageShell title={title}>
      <div className={`card ${styles.state}`}>
        <div className={styles.title}>
          {title} is not available on {chain.name}
        </div>
        <p className={styles.detail}>
          This deployment does not enable {title.toLowerCase()} on {chain.name}.
          Other enabled wallet and network tools remain available.
        </p>
        {alternativeChain ? (
          <button
            type="button"
            className={`uiButton uiButtonPrimary ${styles.action}`}
            onClick={() => {
              const destination = getChainSwitchDestination(location)
              setChainKey(alternativeChain.key)
              if (destination) navigate(destination, { replace: true })
            }}
          >
            Switch to {alternativeChain.name}
          </button>
        ) : null}
      </div>
    </PageShell>
  )
}

export default ChainFeatureGuard
