import { useEffect } from "react"
import { createPortal } from "react-dom"
import type { VoteChoice } from "../../app/governance/proposalFormat"
import styles from "../ProposalDetails.module.css"

type ProposalVoteModalProps = {
  canVote: boolean
  voteChoice: VoteChoice
  voteError?: string
  voteSubmitting: boolean
  onChangeVoteChoice: (choice: VoteChoice) => void
  onClose: () => void
  onSubmit: () => void
}

const ProposalVoteModal = ({
  canVote,
  voteChoice,
  voteError,
  voteSubmitting,
  onChangeVoteChoice,
  onClose,
  onSubmit
}: ProposalVoteModalProps) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !voteSubmitting) onClose()
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [onClose, voteSubmitting])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className={styles.voteModalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-vote-modal-title"
      onClick={() => {
        if (voteSubmitting) return
        onClose()
      }}
    >
      <div
        className={styles.voteModal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.voteModalHeader}>
          <div id="proposal-vote-modal-title" className={styles.voteModalTitle}>
            Vote proposal
          </div>
          <button
            type="button"
            className={styles.voteModalClose}
            onClick={() => {
              if (voteSubmitting) return
              onClose()
            }}
            aria-label="Close vote modal"
          >
            <span />
            <span />
          </button>
        </div>

        <div className={styles.voteModalBody}>
          <div className={styles.voteOptionList}>
            {(
              [
                { key: "YES", label: "Yes" },
                { key: "NO", label: "No" },
                { key: "NO_WITH_VETO", label: "No with veto" },
                { key: "ABSTAIN", label: "Abstain" }
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${styles.voteOptionButton} ${
                  voteChoice === item.key ? styles.voteOptionButtonActive : ""
                }`}
                onClick={() => onChangeVoteChoice(item.key)}
                disabled={voteSubmitting}
              >
                {item.label}
              </button>
            ))}
          </div>
          {voteError ? (
            <div className={styles.voteModalError}>{voteError}</div>
          ) : null}
        </div>

        <div className={styles.voteModalActions}>
          <button
            type="button"
            className="uiButton uiButtonOutline"
            onClick={onClose}
            disabled={voteSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="uiButton uiButtonPrimary"
            onClick={onSubmit}
            disabled={voteSubmitting || !canVote}
          >
            {voteSubmitting ? "Submitting..." : "Submit vote"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ProposalVoteModal
