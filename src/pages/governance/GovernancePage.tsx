import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router-dom"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import Tabs from "../../components/Tabs"
import styles from "../Governance.module.css"
import {
  fetchDepositParams,
  fetchProposals,
  fetchStakingPool,
  fetchTallyParams,
  fetchVotingParams
} from "../../app/data/classic"
import type { GovDepositParams, GovVotingParams, ProposalItem } from "../../app/data/classic"
import { formatTokenAmount } from "../../app/utils/format"
import {
  formatGovernanceDurationLabel,
  governanceToBigInt,
  groupProposalsByStatus,
  type GovernanceTabKey
} from "../../app/governance/governanceList"
import GovernanceProposalCard from "./GovernanceProposalCard"
import { useAppChain } from "../../app/appChainContext"

const Governance = () => {
  const { chain } = useAppChain()
  const { data: proposals = [] } = useQuery<ProposalItem[]>({
    queryKey: ["proposals", chain.chainId],
    queryFn: fetchProposals,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false
  })

  const { data: stakingPool } = useQuery({
    queryKey: ["stakingPool", chain.chainId],
    queryFn: fetchStakingPool,
    staleTime: 5 * 60 * 1000
  })

  const { data: tallyParams } = useQuery({
    queryKey: ["govTallyParams", chain.chainId],
    queryFn: fetchTallyParams,
    staleTime: 10 * 60 * 1000
  })

  const { data: depositParams } = useQuery<GovDepositParams>({
    queryKey: ["govDepositParams", chain.chainId],
    queryFn: fetchDepositParams,
    staleTime: 10 * 60 * 1000
  })

  const { data: votingParams } = useQuery<GovVotingParams>({
    queryKey: ["govVotingParams", chain.chainId],
    queryFn: fetchVotingParams,
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

  const minDepositMicro = useMemo(() => {
    const item = depositParams?.minDeposit?.find((coin) => coin.denom === "uluna")
    return governanceToBigInt(item?.amount)
  }, [depositParams?.minDeposit])

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

  const normalized = useMemo(
    () => groupProposalsByStatus(proposals),
    [proposals]
  )

  const detailFrom = `${location.pathname}${location.search}`

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
        <div className={styles.rulesValue}>
          {minDepositMicro > 0n
            ? `${formatTokenAmount(minDepositMicro.toString(), 6, 0)} ${chain.displayDenom}`
            : "--"}
        </div>
      </div>
      <div className={styles.rulesItem}>
        <div className={styles.rulesLabel}>Maximum deposit period</div>
        <div className={styles.rulesValue}>
          {depositParams?.maxDepositPeriodSeconds
            ? formatGovernanceDurationLabel(depositParams.maxDepositPeriodSeconds)
            : "--"}
        </div>
      </div>
      <div className={styles.rulesItem}>
        <div className={styles.rulesLabel}>Voting period</div>
        <div className={styles.rulesValue}>
          {votingParams?.votingPeriodSeconds
            ? formatGovernanceDurationLabel(votingParams.votingPeriodSeconds)
            : "--"}
        </div>
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
    key: GovernanceTabKey,
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
            <GovernanceProposalCard
              key={proposal.id}
              detailFrom={detailFrom}
              minDepositMicro={minDepositMicro}
              proposal={proposal}
              stakingPoolBondedTokens={stakingPool?.bonded_tokens?.amount}
              statusLabel={statusLabel}
              statusClass={statusClass}
              actionLabel={actionLabel}
              tallyThreshold={tallyParams?.threshold}
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
              <GovernanceProposalCard
                key={item.proposal.id}
                detailFrom={detailFrom}
                minDepositMicro={minDepositMicro}
                proposal={item.proposal}
                stakingPoolBondedTokens={stakingPool?.bonded_tokens?.amount}
                statusLabel={item.statusLabel}
                statusClass={item.statusClass}
                actionLabel={item.statusLabel === "Deposit" ? "Deposit" : undefined}
                tallyThreshold={tallyParams?.threshold}
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
