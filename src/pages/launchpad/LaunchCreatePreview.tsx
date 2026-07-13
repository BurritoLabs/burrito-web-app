import styles from "../Launchpad.module.css"
import { getLaunchpadCreationFeeLabel } from "../../app/config/launchpadConfig"
import { useAppChain } from "../../app/appChainContext"
import { getAddressExplorerUrl, getTxExplorerUrl } from "../../app/explorer"
import { truncateHash } from "../../app/utils/format"
import {
  formatCompact,
  formatNumber,
  formatPrice,
  toNumber
} from "../../app/launchpad/pageModel"
import LaunchTokenLogo from "./LaunchTokenLogo"

type CreatedTokenResult = {
  hash: string
  contractAddress: string
}

type LaunchCreatePreviewProps = {
  tokenSymbol: string
  logoUrl: string
  isCw20Only: boolean
  startPriceLunc: number
  tokenForPool: number
  startingMcapLunc: number
  lockDays: string
  readinessPercent: number
  createError?: string
  createdToken?: CreatedTokenResult
}

const LaunchCreatePreview = ({
  tokenSymbol,
  logoUrl,
  isCw20Only,
  startPriceLunc,
  tokenForPool,
  startingMcapLunc,
  lockDays,
  readinessPercent,
  createError,
  createdToken
}: LaunchCreatePreviewProps) => {
  const { chainKey, chain } = useAppChain()
  const nativeSymbol = chain.displayDenom
  const creationFeeLabel = getLaunchpadCreationFeeLabel(chainKey)

  return (
  <aside className={styles.previewStack}>
    <article className={`card ${styles.previewCard}`}>
      <div className={styles.launchTokenHeader}>
        <LaunchTokenLogo
          symbol={tokenSymbol}
          logoUrl={logoUrl}
          pairedWithLunc={!isCw20Only}
        />
        <div>
          <span>Launch preview</span>
          <strong>
            {isCw20Only ? tokenSymbol : `${tokenSymbol} / ${nativeSymbol}`}
          </strong>
        </div>
      </div>
      <div className={styles.previewStats}>
        <div>
          <span>Start price</span>
          <strong>
            {isCw20Only
              ? "--"
              : `${formatPrice(startPriceLunc)} ${nativeSymbol}`}
          </strong>
        </div>
        <div>
          <span>LP tokens</span>
          <strong>{isCw20Only ? "Not used" : formatCompact(tokenForPool)}</strong>
        </div>
        <div>
          <span>Mcap</span>
          <strong>{formatCompact(startingMcapLunc)} {nativeSymbol}</strong>
        </div>
      </div>
      <div className={styles.lockStrip}>
        <span>{isCw20Only ? "Token mode" : "LP lock"}</span>
        <strong>
          {isCw20Only ? "CW20 only" : `${formatNumber(toNumber(lockDays), 0)} days`}
        </strong>
      </div>
      <div className={styles.lockStrip}>
        <span>Creation fee</span>
        <strong>{creationFeeLabel}</strong>
      </div>
      <div className={styles.progressHeader}>
        <div>
          <span>Ready</span>
          <strong>{readinessPercent}%</strong>
        </div>
        <div className={styles.progressTrack}>
          <i style={{ width: `${readinessPercent}%` }} />
        </div>
      </div>
      {createError ? <div className={styles.txError}>{createError}</div> : null}
      {createdToken ? (
        <div className={styles.txResult}>
          <div>
            <span>Tx</span>
            <a
              href={getTxExplorerUrl(chainKey, createdToken.hash)}
              target="_blank"
              rel="noreferrer"
            >
              {truncateHash(createdToken.hash)}
            </a>
          </div>
          {createdToken.contractAddress ? (
            <div>
              <span>Token</span>
              <a
                href={getAddressExplorerUrl(
                  chainKey,
                  createdToken.contractAddress
                )}
                target="_blank"
                rel="noreferrer"
              >
                {truncateHash(createdToken.contractAddress)}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  </aside>
  )
}

export default LaunchCreatePreview
