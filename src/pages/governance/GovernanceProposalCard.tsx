import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ProposalItem } from "../../app/data/classic"
import { fetchProposalTally } from "../../app/data/classic"
import {
  formatGovernanceProposalType,
  governanceSafeRatio,
  governanceToBigInt
} from "../../app/governance/governanceList"
import {
  formatTimestamp,
  formatTokenAmount
} from "../../app/utils/format"
import styles from "../Governance.module.css"
import { useAppChain } from "../../app/appChainContext"

type GovernanceProposalCardProps = {
  actionLabel?: string
  detailFrom: string
  enableLiveTally: boolean
  minDepositMicro: bigint
  proposal: ProposalItem
  stakingPoolBondedTokens?: string
  statusClass: string
  statusLabel: string
  tallyThreshold?: number
}

const GovernanceProposalCard = ({
  actionLabel,
  detailFrom,
  enableLiveTally,
  minDepositMicro,
  proposal,
  stakingPoolBondedTokens,
  statusClass,
  statusLabel,
  tallyThreshold
}: GovernanceProposalCardProps) => {
  const { chain } = useAppChain()
  const { data: liveTally } = useQuery({
    queryKey: ["proposalTally", chain.chainId, proposal.id],
    queryFn: () => fetchProposalTally(proposal.id),
    enabled: Boolean(proposal.id) && enableLiveTally,
    staleTime: 30_000,
    refetchInterval: enableLiveTally ? 30_000 : false,
    refetchIntervalInBackground: false
  })

  const tally = liveTally ?? proposal.finalTally
  const yesBig = governanceToBigInt(tally?.yes)
  const noBig = governanceToBigInt(tally?.no)
  const abstainBig = governanceToBigInt(tally?.abstain)
  const vetoBig = governanceToBigInt(tally?.noWithVeto)
  const totalVotesBig = yesBig + noBig + abstainBig + vetoBig
  const totalStakedBig = governanceToBigInt(stakingPoolBondedTokens)
  const votedRatio = governanceSafeRatio(totalVotesBig, totalStakedBig)
  const votedPercent = Number.isFinite(votedRatio)
    ? `${(votedRatio * 100).toFixed(2)}%`
    : "--"
  const yesRatio = governanceSafeRatio(yesBig, totalVotesBig)
  const noRatio = governanceSafeRatio(noBig, totalVotesBig)
  const abstainRatio = governanceSafeRatio(abstainBig, totalVotesBig)
  const vetoRatio = governanceSafeRatio(vetoBig, totalVotesBig)
  const byVoted = {
    yes: yesRatio,
    no: noRatio,
    abstain: abstainRatio,
    veto: vetoRatio
  }
  const threshold = tallyThreshold ?? 0
  const determinantThreshold = byVoted.yes + byVoted.no + byVoted.veto
  const thresholdX = threshold * determinantThreshold
  const votedBarWidth = Math.min(100, votedRatio * 100)
  const markerLeft = Math.min(100, thresholdX * votedRatio * 100)
  const isDepositCard = statusLabel === "Deposit"
  const currentDepositBig = governanceToBigInt(proposal.deposit)
  const depositProgressRatio =
    minDepositMicro <= 0n
      ? 0
      : Math.min(
          1,
          Number((currentDepositBig * 10000n) / minDepositMicro) / 10000
        )
  const depositProgressPercent = `${(depositProgressRatio * 100).toFixed(2)}%`
  const remainingDepositBig =
    minDepositMicro > currentDepositBig ? minDepositMicro - currentDepositBig : 0n
  const detailState = { from: detailFrom }
  const depositActionState = {
    from: detailFrom,
    openDeposit: true
  }

  return (
    <div className={`card ${styles.proposalCard}`}>
      <Link
        key={proposal.id}
        className={styles.proposalLink}
        to={`/proposal/${proposal.id}`}
        state={detailState}
      >
        <div className={styles.proposalMetaRow}>
          <div className={styles.proposalMetaLeft}>
            <span className={styles.proposalMetaText}>
              #{proposal.id} | {formatGovernanceProposalType(proposal.contentType)}
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

        {isDepositCard ? (
          <div className={styles.progressBlock}>
            <div className={styles.progressLabel}>
              Deposited / Minimum
              <span className={styles.progressValue}>{depositProgressPercent}</span>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.depositBar}
                style={{ width: `${depositProgressRatio * 100}%` }}
              />
            </div>
            <div className={styles.depositMeta}>
              <span>
                {formatTokenAmount(currentDepositBig.toString(), 6, 2)} /{" "}
                {formatTokenAmount(minDepositMicro.toString(), 6, 2)} {chain.displayDenom}
              </span>
              <span>
                {remainingDepositBig > 0n
                  ? `${formatTokenAmount(
                      remainingDepositBig.toString(),
                      6,
                      2
                    )} ${chain.displayDenom} remaining`
                  : "Minimum reached"}
              </span>
            </div>
          </div>
        ) : (
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
        )}
      </Link>

      <div className={styles.proposalFooter}>
        <span>
          {isDepositCard
            ? proposal.depositEndTime
              ? `Ends ${formatTimestamp(proposal.depositEndTime)}`
              : "--"
            : proposal.votingEndTime
            ? `Ends ${formatTimestamp(proposal.votingEndTime)}`
            : "--"}
        </span>
        {actionLabel ? (
          isDepositCard ? (
            <Link
              className={`uiButton uiButtonOutline ${styles.proposalAction}`}
              to={`/proposal/${proposal.id}`}
              state={depositActionState}
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              className={`uiButton uiButtonOutline ${styles.proposalAction}`}
              type="button"
            >
              {actionLabel}
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}

export default GovernanceProposalCard
