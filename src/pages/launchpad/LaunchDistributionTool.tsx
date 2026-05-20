import type { FormEvent } from "react"
import { truncateHash } from "../../app/utils/format"
import styles from "../Launchpad.module.css"
import type {
  Cw20DistributionTransfer,
  OwnerLaunchRecord
} from "../../app/launchpad/pageModel"

type DistributionPreview = {
  error?: string
  totalAmount: string
  transfers: Cw20DistributionTransfer[]
}

type LaunchDistributionToolProps = {
  activeOwnerIsCw20Only: boolean
  activeOwnerLaunch: OwnerLaunchRecord
  activeTokenDecimals: number
  canDistributeTokens: boolean
  distributionError?: string
  distributionInput: string
  distributionPreview: DistributionPreview
  distributionSubmitting: boolean
  distributionTxHash: string
  walletReady: boolean
  onDistributionInputChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function LaunchDistributionTool({
  activeOwnerIsCw20Only,
  activeOwnerLaunch,
  activeTokenDecimals,
  canDistributeTokens,
  distributionError,
  distributionInput,
  distributionPreview,
  distributionSubmitting,
  distributionTxHash,
  walletReady,
  onDistributionInputChange,
  onSubmit
}: LaunchDistributionToolProps) {
  return (
    <article
      id="launchpad-distribution"
      className={`card ${styles.tokenDistribution} ${
        activeOwnerIsCw20Only ? styles.ownerPrimaryTool : ""
      }`}
    >
      <div className={styles.planHeader}>
        <span>Distribution</span>
        <h3>Send tokens</h3>
        <p>One line is one CW20 transfer.</p>
      </div>
      <div className={styles.poolStatusGrid}>
        <div>
          <span>Token</span>
          <strong>
            {activeOwnerLaunch.contractAddress
              ? truncateHash(activeOwnerLaunch.contractAddress)
              : "No CW20"}
          </strong>
        </div>
        <div>
          <span>Decimals</span>
          <strong>{activeTokenDecimals}</strong>
        </div>
        <div>
          <span>Recipients</span>
          <strong>{distributionPreview.transfers.length}</strong>
        </div>
        <div>
          <span>Total amount</span>
          <strong>
            {distributionPreview.transfers.length
              ? `${distributionPreview.totalAmount} ${activeOwnerLaunch.symbol}`
              : "--"}
          </strong>
        </div>
      </div>
      <form className={styles.liquidityForm} onSubmit={onSubmit}>
        <label className={`${styles.field} ${styles.fullField}`}>
          <span>Recipients and amounts</span>
          <textarea
            value={distributionInput}
            onChange={(event) => onDistributionInputChange(event.target.value)}
            placeholder={`terra1... 1000\nterra1... 2500`}
            spellCheck={false}
          />
        </label>
        <div className={styles.noticeBox}>
          Format: `terra1address amount`. Burrito will broadcast one CW20
          transfer message per line in a single transaction.
        </div>
        {distributionPreview.error && distributionInput.trim() ? (
          <div className={styles.txError}>{distributionPreview.error}</div>
        ) : null}
        {distributionError ? (
          <div className={styles.txError}>{distributionError}</div>
        ) : null}
        {distributionTxHash ? (
          <div className={styles.txResult}>
            <div>
              <span>Distribution tx</span>
              <a
                href={`https://finder.burrito.money/classic/tx/${distributionTxHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {truncateHash(distributionTxHash)}
              </a>
            </div>
          </div>
        ) : null}
        <button
          className="uiButton uiButtonPrimary"
          type="submit"
          disabled={!canDistributeTokens}
        >
          {distributionSubmitting
            ? "Broadcasting..."
            : !walletReady
            ? "Connect wallet first"
            : distributionPreview.transfers.length
            ? `Send ${distributionPreview.transfers.length} transfer${
                distributionPreview.transfers.length === 1 ? "" : "s"
              }`
            : "Enter recipients"}
        </button>
      </form>
    </article>
  )
}

export default LaunchDistributionTool
