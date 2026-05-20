type ProposalPrimaryActionProps = {
  actionDisabled: boolean
  actionLabel: string | null
  isDepositPeriod: boolean
  isVotingPeriod: boolean
  onOpenDeposit: () => void
  onOpenVote: () => void
}

function ProposalPrimaryAction({
  actionDisabled,
  actionLabel,
  isDepositPeriod,
  isVotingPeriod,
  onOpenDeposit,
  onOpenVote
}: ProposalPrimaryActionProps) {
  if (!actionLabel) return null

  return (
    <button
      className="uiButton uiButtonPrimary"
      type="button"
      onClick={() => {
        if (isVotingPeriod) {
          onOpenVote()
          return
        }
        if (isDepositPeriod) {
          onOpenDeposit()
        }
      }}
      disabled={actionDisabled}
    >
      {actionLabel}
    </button>
  )
}

export default ProposalPrimaryAction
