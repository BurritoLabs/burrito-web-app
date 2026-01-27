import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Governance.module.css"
import { fetchProposals } from "../app/data/classic"
import type { ProposalItem } from "../app/data/classic"
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

  const [activeKey, setActiveKey] = useState("all")

  const chainFilters = (
    <div className={styles.panelHeader}>
      <div className={styles.chainPills}>
        <button
          className={`${styles.chainPill} ${styles.chainPillAll} ${
            activeKey === "all" ? styles.chainPillActive : ""
          }`}
          type="button"
          onClick={() => setActiveKey("all")}
        >
          All proposals
        </button>
      </div>
    </div>
  )

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
          <div className={styles.proposalTitleBlock}>
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
            <button
              className={`uiButton uiButtonOutline ${styles.proposalAction}`}
              type="button"
            >
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

  const renderEmptyState = (message: string) => (
    <div className={styles.emptyCard}>
      <div className={styles.emptyIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path
            d="M4 7h16v10H4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 11h8M8 15h5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className={styles.emptyTitle}>{message}</div>
    </div>
  )

  const renderPanel = (content: ReactNode) => (
    <div className={styles.panel}>
      {chainFilters}
      <div className={styles.panelBody}>{content}</div>
    </div>
  )

  const renderList = (
    list: ProposalItem[],
    statusLabel: string,
    statusClass: string,
    emptyMessage: string,
    actionLabel?: string
  ) =>
    list.length ? (
      <div className={styles.proposals}>
        {list.map((proposal) =>
          renderProposal(proposal, statusLabel, statusClass, actionLabel)
        )}
      </div>
    ) : (
      renderEmptyState(emptyMessage)
    )

  const getAllContent = () => {
    if (activeKey !== "all") return null
    const hasAny =
      normalized.voting.length ||
      normalized.deposit.length ||
      normalized.passed.length ||
      normalized.rejected.length
    return renderPanel(
      hasAny ? (
        <div className={styles.proposals}>
          {normalized.voting.map((proposal) =>
            renderProposal(proposal, "Voting", styles.statusVoting, "Vote")
          )}
          {normalized.deposit.map((proposal) =>
            renderProposal(
              proposal,
              "Deposit",
              styles.statusDeposit,
              "Deposit"
            )
          )}
          {normalized.passed.map((proposal) =>
            renderProposal(proposal, "Passed", styles.statusPassed)
          )}
          {normalized.rejected.map((proposal) =>
            renderProposal(proposal, "Rejected", styles.statusRejected)
          )}
        </div>
      ) : (
        renderEmptyState("No proposals")
      )
    )
  }

  const getVotingContent = () => {
    if (activeKey !== "voting") return null
    return renderPanel(
      renderList(
        normalized.voting,
        "Voting",
        styles.statusVoting,
        "No proposals in voting period",
        "Vote"
      )
    )
  }

  const getDepositContent = () => {
    if (activeKey !== "deposit") return null
    return renderPanel(
      renderList(
        normalized.deposit,
        "Deposit",
        styles.statusDeposit,
        "No proposals in deposit period",
        "Deposit"
      )
    )
  }

  const getPassedContent = () => {
    if (activeKey !== "passed") return null
    return renderPanel(
      renderList(
        normalized.passed,
        "Passed",
        styles.statusPassed,
        "No passed proposals"
      )
    )
  }

  const getRejectedContent = () => {
    if (activeKey !== "rejected") return null
    return renderPanel(
      renderList(
        normalized.rejected,
        "Rejected",
        styles.statusRejected,
        "No rejected proposals"
      )
    )
  }

  const tabs = [
    {
      key: "all",
      label: "All",
      content: getAllContent(),
      hidden: true
    },
    {
      key: "voting",
      label: "Voting",
      content: getVotingContent()
    },
    {
      key: "deposit",
      label: "Deposit",
      content: getDepositContent()
    },
    {
      key: "passed",
      label: "Passed",
      content: getPassedContent()
    },
    {
      key: "rejected",
      label: "Rejected",
      content: getRejectedContent()
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
      <Tabs
        tabs={tabs}
        variant="card"
        activeKey={activeKey}
        onChange={(key) => setActiveKey(key)}
      />
    </PageShell>
  )
}

export default Governance
