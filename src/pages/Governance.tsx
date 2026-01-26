import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Governance.module.css"
import { fetchProposals, ProposalItem } from "../app/data/classic"
import {
  formatPercent,
  formatTimestamp,
  formatTokenAmount
} from "../app/utils/format"
import { CLASSIC_DENOMS } from "../app/chain"

const Governance = () => {
  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals"],
    queryFn: fetchProposals,
    staleTime: 60_000
  })

  const normalized = useMemo(() => {
    const groups: Record<string, ProposalItem[]> = {
      voting: [],
      deposit: [],
      passed: [],
      rejected: []
    }

    proposals.forEach((proposal) => {
      const status = String(proposal.status).toUpperCase()
      if (status.includes("VOTING")) groups.voting.push(proposal)
      else if (status.includes("DEPOSIT")) groups.deposit.push(proposal)
      else if (status.includes("PASSED")) groups.passed.push(proposal)
      else if (status.includes("REJECTED")) groups.rejected.push(proposal)
    })

    return groups
  }, [proposals])

  const renderProposal = (
    proposal: ProposalItem,
    statusLabel: string,
    statusClass: string,
    actionLabel?: string
  ) => {
    const depositDisplay = formatTokenAmount(
      proposal.deposit,
      CLASSIC_DENOMS.lunc.coinDecimals,
      2
    )
    const tally = proposal.finalTally
    const totalVotes = tally
      ? Number(tally.yes) +
        Number(tally.no) +
        Number(tally.abstain) +
        Number(tally.noWithVeto)
      : 0
    const yes = tally && totalVotes > 0 ? formatPercent((Number(tally.yes) / totalVotes) * 100) : "--"

    return (
      <div key={proposal.id} className={`card ${styles.proposalCard}`}>
        <div className={styles.proposalTagRow}>
          <span className={styles.proposalTag}>#{proposal.id}</span>
          <span className={`${styles.statusPill} ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className={styles.proposalHeader}>
          <div>
            <strong>{proposal.title}</strong>
            <span>
              {proposal.votingEndTime
                ? `Voting ends ${formatTimestamp(proposal.votingEndTime)}`
                : proposal.submitTime
                  ? `Submitted ${formatTimestamp(proposal.submitTime)}`
                  : "Status update --"}
            </span>
          </div>
          {actionLabel ? (
            <button className="uiButton uiButtonOutline" type="button">
              {actionLabel}
            </button>
          ) : null}
        </div>
        <div className={styles.proposalMeta}>
          <span>Deposit: {depositDisplay} LUNC</span>
          <span>Yes: {yes}</span>
          <span>Quorum: --</span>
        </div>
      </div>
    )
  }

  const tabs = [
    {
      key: "voting",
      label: "Voting",
      content: (
        <div className={styles.proposals}>
          {normalized.voting.length
            ? normalized.voting.map((proposal) =>
                renderProposal(
                  proposal,
                  "Voting",
                  styles.statusVoting,
                  "Vote"
                )
              )
            : renderProposal(
                {
                  id: "--",
                  status: "",
                  title: "No voting proposals",
                  deposit: "0"
                },
                "Voting",
                styles.statusVoting
              )}
        </div>
      )
    },
    {
      key: "deposit",
      label: "Deposit",
      content: (
        <div className={styles.proposals}>
          {normalized.deposit.length
            ? normalized.deposit.map((proposal) =>
                renderProposal(
                  proposal,
                  "Deposit",
                  styles.statusDeposit,
                  "Deposit"
                )
              )
            : renderProposal(
                {
                  id: "--",
                  status: "",
                  title: "No deposit proposals",
                  deposit: "0"
                },
                "Deposit",
                styles.statusDeposit
              )}
        </div>
      )
    },
    {
      key: "passed",
      label: "Passed",
      content: (
        <div className={styles.proposals}>
          {normalized.passed.length
            ? normalized.passed.map((proposal) =>
                renderProposal(proposal, "Passed", styles.statusPassed)
              )
            : renderProposal(
                {
                  id: "--",
                  status: "",
                  title: "No passed proposals",
                  deposit: "0"
                },
                "Passed",
                styles.statusPassed
              )}
        </div>
      )
    },
    {
      key: "rejected",
      label: "Rejected",
      content: (
        <div className={styles.proposals}>
          {normalized.rejected.length
            ? normalized.rejected.map((proposal) =>
                renderProposal(proposal, "Rejected", styles.statusRejected)
              )
            : renderProposal(
                {
                  id: "--",
                  status: "",
                  title: "No rejected proposals",
                  deposit: "0"
                },
                "Rejected",
                styles.statusRejected
              )}
        </div>
      )
    }
  ]

  return (
    <PageShell
      title="Governance"
      extra={
        <button className="uiButton uiButtonPrimary" type="button">
          New proposal
        </button>
      }
    >
      <Tabs tabs={tabs} variant="card" />
    </PageShell>
  )
}

export default Governance
