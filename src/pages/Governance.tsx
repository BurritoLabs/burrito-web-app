import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router-dom"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Governance.module.css"
import {
  fetchProposals,
  fetchProposalTally,
  fetchStakingPool,
  fetchTallyParams
} from "../app/data/classic"
import type { ProposalItem } from "../app/data/classic"
import {
  formatTimestamp
} from "../app/utils/format"

const Governance = () => {
  const { data: proposals = [] } = useQuery<ProposalItem[]>({
    queryKey: ["proposals"],
    queryFn: fetchProposals,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true
  })

  const { data: stakingPool } = useQuery({
    queryKey: ["stakingPool"],
    queryFn: fetchStakingPool,
    staleTime: 5 * 60 * 1000
  })

  const { data: tallyParams } = useQuery({
    queryKey: ["govTallyParams"],
    queryFn: fetchTallyParams,
    staleTime: 10 * 60 * 1000
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [activeKey, setActiveKey] = useState("voting")
  const [visibleCounts, setVisibleCounts] = useState(() => ({
    all: 30,
    voting: 30,
    deposit: 30,
    passed: 30,
    rejected: 30
  }))

  const validTabs = useMemo(
    () => new Set(["all", "voting", "deposit", "passed", "rejected"]),
    []
  )

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && validTabs.has(tab) && tab !== activeKey) {
      setActiveKey(tab)
    }
  }, [activeKey, searchParams, validTabs])

  const updateTab = (tab: string) => {
    setActiveKey(tab)
    const next = new URLSearchParams(searchParams)
    next.set("tab", tab)
    setSearchParams(next, { replace: true })
  }

  const loadMore = (key: string) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [key]: (prev[key as keyof typeof prev] ?? 30) + 30
    }))
  }

  const formatProposalType = (type?: string) => {
    if (!type) return "Proposal"
    const last = type.split(".").pop() ?? type
    const cleaned = last.replace("Proposal", "").replace(/^Msg/, "")
    const spaced = cleaned.replace(/([A-Z])/g, " $1").trim()
    const label = spaced.length ? spaced.toLowerCase() : "proposal"
    return last.startsWith("Msg") ? `Msg ${label}` : label
  }

  const safeRatio = (num: bigint, den: bigint) => {
    try {
      if (den === 0n) return 0
      const scaled = (num * 1_000_000n) / den
      return Number(scaled) / 1_000_000
    } catch {
      return 0
    }
  }
  const toBigInt = (value?: string | number) => {
    try {
      if (value === undefined || value === null) return 0n
      const raw = typeof value === "number" ? Math.trunc(value).toString() : value
      return BigInt(raw)
    } catch {
      return 0n
    }
  }

  const chainFilters = (
    <div className={styles.panelHeader}>
      <div className={styles.chainPills}>
        <button
          className={`${styles.chainPill} ${styles.chainPillAll} ${
            activeKey === "all" ? styles.chainPillActive : ""
          }`}
          type="button"
          onClick={() => updateTab("all")}
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

  const ProposalCard = ({
    proposal,
    statusLabel,
    statusClass,
    actionLabel,
    enableLiveTally
  }: {
    proposal: ProposalItem,
    statusLabel: string,
    statusClass: string,
    actionLabel?: string,
    enableLiveTally: boolean
  }) => {
    const { data: liveTally } = useQuery({
      queryKey: ["proposalTally", proposal.id],
      queryFn: () => fetchProposalTally(proposal.id),
      enabled: Boolean(proposal.id) && enableLiveTally,
      staleTime: 10_000,
      refetchInterval: enableLiveTally ? 15_000 : false,
      refetchIntervalInBackground: true
    })

    const tally = liveTally ?? proposal.finalTally
    const yesBig = toBigInt(tally?.yes)
    const noBig = toBigInt(tally?.no)
    const abstainBig = toBigInt(tally?.abstain)
    const vetoBig = toBigInt(tally?.noWithVeto)
    const totalVotesBig = yesBig + noBig + abstainBig + vetoBig
    const totalStakedBig = toBigInt(stakingPool?.bonded_tokens?.amount)
    const votedRatio = safeRatio(totalVotesBig, totalStakedBig)
    const votedPercent = Number.isFinite(votedRatio)
      ? `${(votedRatio * 100).toFixed(2)}%`
      : "--"
    const yesRatio = safeRatio(yesBig, totalVotesBig)
    const noRatio = safeRatio(noBig, totalVotesBig)
    const abstainRatio = safeRatio(abstainBig, totalVotesBig)
    const vetoRatio = safeRatio(vetoBig, totalVotesBig)
    const byVoted = {
      yes: yesRatio,
      no: noRatio,
      abstain: abstainRatio,
      veto: vetoRatio
    }
    const threshold = tallyParams?.threshold ?? 0
    const determinantThreshold = byVoted.yes + byVoted.no + byVoted.veto
    const thresholdX = threshold * determinantThreshold
    const votedBarWidth = Math.min(100, votedRatio * 100)
    const markerLeft = Math.min(100, thresholdX * votedRatio * 100)
    return (
      <Link
        key={proposal.id}
        className={styles.proposalLink}
        to={`/proposal/${proposal.id}`}
        state={{ from: `${location.pathname}${location.search}` }}
      >
        <div className={`card ${styles.proposalCard}`}>
        <div className={styles.proposalMetaRow}>
          <div className={styles.proposalMetaLeft}>
            <span className={styles.proposalMetaText}>
              #{proposal.id} | {formatProposalType(proposal.contentType)}
            </span>
          </div>
          <span className={`${styles.statusPill} ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className={styles.proposalTitle}>{proposal.title}</div>
        <div className={styles.proposalTime}>
          {proposal.submitTime
            ? `Submitted ${formatTimestamp(proposal.submitTime)}`
            : "Status update --"}
        </div>

        <div className={styles.progressBlock}>
          <div className={styles.progressLabel}>
            Voted / Bonded
            <span className={styles.progressValue}>{votedPercent}</span>
          </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.votedBar}
                style={{ width: `${votedBarWidth}%` }}
              >
                <div
                  className={`${styles.progressSegment} ${styles.segmentYes}`}
                  style={{ width: `${byVoted.yes * 100}%` }}
                />
                <div
                  className={`${styles.progressSegment} ${styles.segmentNo}`}
                  style={{ width: `${byVoted.no * 100}%` }}
                />
                <div
                  className={`${styles.progressSegment} ${styles.segmentVeto}`}
                  style={{ width: `${byVoted.veto * 100}%` }}
                />
                <div
                  className={`${styles.progressSegment} ${styles.segmentAbstain}`}
                  style={{ width: `${byVoted.abstain * 100}%` }}
                />
              </div>
              {Number.isFinite(markerLeft) && markerLeft > 0 ? (
                <span
                  className={styles.progressMarker}
                  style={{ left: `${markerLeft}%` }}
                />
              ) : null}
            </div>
        </div>

        <div className={styles.proposalFooter}>
          <span>
            {proposal.votingEndTime
              ? `Ends ${formatTimestamp(proposal.votingEndTime)}`
              : "--"}
          </span>
          {actionLabel ? (
            <button
              className={`uiButton uiButtonOutline ${styles.proposalAction}`}
              type="button"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        </div>
      </Link>
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

  const rulesCard = (
    <div className={`card ${styles.rulesCard}`}>
      <div className={styles.rulesItem}>
        <div className={styles.rulesLabel}>Minimum deposit</div>
        <div className={styles.rulesValue}>5,000,000 LUNC</div>
      </div>
      <div className={styles.rulesItem}>
        <div className={styles.rulesLabel}>Maximum deposit period</div>
        <div className={styles.rulesValue}>7 days</div>
      </div>
      <div className={styles.rulesItem}>
        <div className={styles.rulesLabel}>Voting period</div>
        <div className={styles.rulesValue}>7 days</div>
      </div>
    </div>
  )

  const renderPanel = (content: ReactNode) => (
    <div className={styles.panelWrap}>
      <div className={styles.panel}>
        {chainFilters}
        <div className={styles.panelBody}>{content}</div>
      </div>
      {rulesCard}
    </div>
  )

  const renderList = (
    key: "all" | "voting" | "deposit" | "passed" | "rejected",
    list: ProposalItem[],
    statusLabel: string,
    statusClass: string,
    emptyMessage: string,
    actionLabel?: string
  ) =>
    list.length ? (
      <>
        <div className={styles.proposals}>
          {list.slice(0, visibleCounts[key]).map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              statusLabel={statusLabel}
              statusClass={statusClass}
              actionLabel={actionLabel}
              enableLiveTally={
                (activeKey === "voting" || activeKey === "all") &&
                String(proposal.status).toUpperCase().includes("VOTING")
              }
            />
          ))}
        </div>
        {list.length > visibleCounts[key] ? (
          <div className={styles.loadMoreWrap}>
            <button
              className="uiButton"
              type="button"
              onClick={() => loadMore(key)}
            >
              Load more
            </button>
          </div>
        ) : null}
      </>
    ) : (
      renderEmptyState(emptyMessage)
    )

  const getAllContent = () => {
    if (activeKey !== "all") return null
    const allList = [
      ...normalized.voting.map((proposal) => ({
        proposal,
        statusLabel: "Voting",
        statusClass: styles.statusVoting
      })),
      ...normalized.deposit.map((proposal) => ({
        proposal,
        statusLabel: "Deposit",
        statusClass: styles.statusDeposit
      })),
      ...normalized.passed.map((proposal) => ({
        proposal,
        statusLabel: "Passed",
        statusClass: styles.statusPassed
      })),
      ...normalized.rejected.map((proposal) => ({
        proposal,
        statusLabel: "Rejected",
        statusClass: styles.statusRejected
      }))
    ]

    return renderPanel(
      allList.length ? (
        <>
          <div className={styles.proposals}>
            {allList.slice(0, visibleCounts.all).map((item) => (
              <ProposalCard
                key={item.proposal.id}
                proposal={item.proposal}
                statusLabel={item.statusLabel}
                statusClass={item.statusClass}
                actionLabel={item.statusLabel === "Deposit" ? "Deposit" : undefined}
                enableLiveTally={
                  String(item.proposal.status).toUpperCase().includes("VOTING")
                }
              />
            ))}
          </div>
          {allList.length > visibleCounts.all ? (
            <div className={styles.loadMoreWrap}>
              <button
                className="uiButton"
                type="button"
                onClick={() => loadMore("all")}
              >
                Load more
              </button>
            </div>
          ) : null}
        </>
      ) : (
        renderEmptyState("No proposals")
      )
    )
  }

  const getVotingContent = () => {
    if (activeKey !== "voting") return null
    return renderPanel(
      renderList(
        "voting",
        normalized.voting,
        "Voting",
        styles.statusVoting,
        "No proposals in voting period"
      )
    )
  }

  const getDepositContent = () => {
    if (activeKey !== "deposit") return null
    return renderPanel(
      renderList(
        "deposit",
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
        "passed",
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
        "rejected",
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
        <Link className="uiButton uiButtonPrimary" to="/proposal/new">
          New proposal
        </Link>
      }
    >
      <Tabs
        tabs={tabs}
        variant="card"
        activeKey={activeKey}
        onChange={(key) => updateTab(key)}
      />
    </PageShell>
  )
}

export default Governance
