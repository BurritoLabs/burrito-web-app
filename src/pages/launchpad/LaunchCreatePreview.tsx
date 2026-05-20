import styles from "../Launchpad.module.css"
import { LAUNCHPAD_CREATION_FEE_LABEL } from "../../app/config/launchpadConfig"
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
}: LaunchCreatePreviewProps) => (
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
          <strong>{isCw20Only ? tokenSymbol : `${tokenSymbol} / LUNC`}</strong>
        </div>
      </div>
      <div className={styles.previewStats}>
        <div>
          <span>Start price</span>
          <strong>
            {isCw20Only ? "--" : `${formatPrice(startPriceLunc)} LUNC`}
          </strong>
        </div>
        <div>
          <span>LP tokens</span>
          <strong>{isCw20Only ? "Not used" : formatCompact(tokenForPool)}</strong>
        </div>
        <div>
          <span>Mcap</span>
          <strong>{formatCompact(startingMcapLunc)} LUNC</strong>
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
        <strong>{LAUNCHPAD_CREATION_FEE_LABEL}</strong>
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
              href={`https://finder.burrito.money/classic/tx/${createdToken.hash}`}
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
                href={`https://finder.burrito.money/classic/address/${createdToken.contractAddress}`}
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

export default LaunchCreatePreview
