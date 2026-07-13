import { createPortal } from "react-dom"
import {
  formatAmountInput,
  sanitizeDecimalInput
} from "../../app/governance/proposalFormat"
import {
  formatTimestamp,
  formatTokenAmount
} from "../../app/utils/format"
import styles from "../ProposalDetails.module.css"
import { useAppChain } from "../../app/appChainContext"

type ProposalDepositStats = {
  current: string
  minimum: string
  remaining: string
}

type ProposalDepositModalProps = {
  depositAmount: string
  depositAmountMicro: bigint
  depositAmountValue: number
  depositError?: string
  depositSubmitting: boolean
  depositValidationMessage?: string
  luncBalance: string
  luncBalanceLabel: string
  proposalDepositEndTime?: string
  stats: ProposalDepositStats
  onClose: () => void
  onSubmit: () => void
  onUpdateAmount: (value: string) => void
}

const ProposalDepositModal = ({
  depositAmount,
  depositAmountMicro,
  depositAmountValue,
  depositError,
  depositSubmitting,
  depositValidationMessage,
  luncBalance,
  luncBalanceLabel,
  proposalDepositEndTime,
  stats,
  onClose,
  onSubmit,
  onUpdateAmount
}: ProposalDepositModalProps) => {
  const { chain } = useAppChain()
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className={styles.voteModalBackdrop}
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (depositSubmitting) return
        onClose()
      }}
    >
      <div
        className={styles.voteModal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.voteModalHeader}>
          <div className={styles.voteModalTitle}>Deposit to proposal</div>
          <button
            type="button"
            className={styles.voteModalClose}
            onClick={() => {
              if (depositSubmitting) return
              onClose()
            }}
            aria-label="Close deposit modal"
          >
            <span />
            <span />
          </button>
        </div>

        <div className={styles.voteModalBody}>
          <div className={styles.depositModalSummary}>
            <div className={styles.depositModalRow}>
              <span>Current deposited</span>
              <strong>{stats.current}</strong>
            </div>
            <div className={styles.depositModalRow}>
              <span>Minimum required</span>
              <strong>{stats.minimum}</strong>
            </div>
            <div className={styles.depositModalRow}>
              <span>Remaining</span>
              <strong>{stats.remaining}</strong>
            </div>
            <div className={styles.depositModalRow}>
              <span>Your balance</span>
              <strong>{luncBalanceLabel}</strong>
            </div>
          </div>

          <div className={styles.depositField}>
            <div className={styles.depositFieldHeader}>
              <label
                htmlFor="proposal-deposit-amount"
                className={styles.depositFieldLabel}
              >
                Deposit amount
              </label>
              <button
                type="button"
                className={styles.depositMaxButton}
                onClick={() => onUpdateAmount(formatAmountInput(luncBalance))}
                disabled={depositSubmitting}
              >
                Max
              </button>
            </div>
            <div className={styles.depositAmountWrap}>
              <input
                id="proposal-deposit-amount"
                className={styles.depositAmountInput}
                inputMode="decimal"
                type="text"
                value={depositAmount}
                onChange={(event) =>
                  onUpdateAmount(sanitizeDecimalInput(event.target.value))
                }
                placeholder="0.0"
                disabled={depositSubmitting}
              />
              <span className={styles.depositAmountDenom}>
                {chain.displayDenom}
              </span>
            </div>
            <div className={styles.depositFieldHint}>
              Deposit end:{" "}
              {proposalDepositEndTime ? formatTimestamp(proposalDepositEndTime) : "--"}
            </div>
          </div>

          {depositError ? (
            <div className={styles.voteModalError}>{depositError}</div>
          ) : depositValidationMessage ? (
            <div className={styles.depositModalHint}>
              {depositValidationMessage}
            </div>
          ) : (
            <div className={styles.depositModalHint}>
              You will deposit{" "}
              {depositAmountValue > 0
                ? `${formatTokenAmount(depositAmountMicro.toString(), 6, 6)} ${chain.displayDenom}`
                : "--"}
              .
            </div>
          )}
        </div>

        <div className={styles.voteModalActions}>
          <button
            type="button"
            className="uiButton uiButtonOutline"
            onClick={onClose}
            disabled={depositSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="uiButton uiButtonPrimary"
            onClick={onSubmit}
            disabled={depositSubmitting || Boolean(depositValidationMessage)}
          >
            {depositSubmitting ? "Submitting..." : "Deposit"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ProposalDepositModal
