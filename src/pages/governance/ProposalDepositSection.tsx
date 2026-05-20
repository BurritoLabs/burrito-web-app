import type { ProposalDeposit } from "../../app/data/classic"
import { formatCoinList } from "../../app/governance/proposalFormat"
import { formatTimestamp } from "../../app/utils/format"
import styles from "../ProposalDetails.module.css"

type ProposalDepositStats = {
  current: string
  maxPeriod: string
  minimum: string
  progressLabel: string
  remaining: string
}

type ProposalDepositSectionProps = {
  accountAddress?: string
  canDeposit: boolean
  depositProgressPercent: number
  deposits: ProposalDeposit[]
  luncBalanceLabel: string
  proposalDepositEndTime?: string
  stats: ProposalDepositStats
  onOpenDeposit: () => void
}

const ProposalDepositSection = ({
  accountAddress,
  canDeposit,
  depositProgressPercent,
  deposits,
  luncBalanceLabel,
  proposalDepositEndTime,
  stats,
  onOpenDeposit
}: ProposalDepositSectionProps) => (
  <div className={`card ${styles.sectionCard}`}>
    <div className={styles.sectionHeader}>Deposits</div>
    <div className={`${styles.sectionBody} ${styles.depositBody}`}>
      <div className={styles.depositSummary}>
        <div className={styles.depositSummaryGrid}>
          <div className={styles.depositMetric}>
            <div className={styles.depositMetricLabel}>Current deposited</div>
            <div className={styles.depositMetricValue}>{stats.current}</div>
          </div>
          <div className={styles.depositMetric}>
            <div className={styles.depositMetricLabel}>Minimum required</div>
            <div className={styles.depositMetricValue}>{stats.minimum}</div>
          </div>
          <div className={styles.depositMetric}>
            <div className={styles.depositMetricLabel}>Remaining</div>
            <div className={styles.depositMetricValue}>{stats.remaining}</div>
          </div>
          <div className={styles.depositMetric}>
            <div className={styles.depositMetricLabel}>Deposit period</div>
            <div className={styles.depositMetricValue}>
              {proposalDepositEndTime
                ? `Ends ${formatTimestamp(proposalDepositEndTime)}`
                : stats.maxPeriod}
            </div>
          </div>
        </div>

        <div className={styles.depositProgressBlock}>
          <div className={styles.depositProgressHeader}>
            <span className={styles.depositProgressLabel}>
              Deposit progress
            </span>
            <span className={styles.depositProgressValue}>
              {stats.progressLabel}
            </span>
          </div>
          <div className={styles.depositProgressTrack}>
            <div
              className={styles.depositProgressFill}
              style={{ width: `${depositProgressPercent}%` }}
            />
          </div>
          <div className={styles.depositProgressMeta}>
            {accountAddress ? (
              <span>Your balance: {luncBalanceLabel}</span>
            ) : (
              <span>Connect a wallet to contribute to this proposal.</span>
            )}
            {canDeposit ? (
              <button
                type="button"
                className="uiButton uiButtonPrimary"
                onClick={onOpenDeposit}
              >
                Deposit
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {deposits.length ? (
        <div className={styles.list}>
          {deposits.map((deposit, index) => (
            <div
              key={`${deposit.depositor}-${index}`}
              className={styles.listRow}
            >
              <div className={styles.listName}>{deposit.depositor}</div>
              <div className={styles.listValue}>
                {formatCoinList(deposit.amount)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>No deposits yet.</div>
      )}
    </div>
  </div>
)

export default ProposalDepositSection
