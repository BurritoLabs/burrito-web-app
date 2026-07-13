import type { ReactNode } from "react"
import PageShell from "../../pages/PageShell"
import { useAppChain } from "../appChainContext"
import type { AppChainConfig } from "../appChains"
import styles from "./ChainFeatureGuard.module.css"

type ChainFeature = keyof AppChainConfig["features"]

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
  const { chain, setChainKey } = useAppChain()

  if (chain.features[feature]) return children

  return (
    <PageShell title={title}>
      <div className={`card ${styles.state}`}>
        <div className={styles.title}>Phoenix integration is not configured</div>
        <p className={styles.detail}>
          This page requires Phoenix DEX or launchpad contract configuration.
          Wallet, staking, governance, history, and CosmWasm tools remain
          available on Terra.
        </p>
        <button
          type="button"
          className={`uiButton uiButtonPrimary ${styles.action}`}
          onClick={() => setChainKey("lunc")}
        >
          Switch to Terra Classic
        </button>
      </div>
    </PageShell>
  )
}

export default ChainFeatureGuard
