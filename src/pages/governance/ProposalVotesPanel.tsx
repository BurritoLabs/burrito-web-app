import type { ProposalVote } from "../../app/data/classic"
import {
  formatPercentPlain,
  formatVoteOption,
  getVoteColor,
  getWeightPercent
} from "../../app/governance/proposalFormat"
import {
  formatTimestamp,
  formatTokenAmount,
  truncateHash
} from "../../app/utils/format"
import styles from "../ProposalDetails.module.css"
import ProposalVoteFlag from "./ProposalVoteFlag"

type VoteRow = {
  amount: string
  barValue: number
  filterKey: string
  itemClass: string
  label: string
  segmentClass: string
  textClass: string
  value: number
}

type ValidatorVoteRow = Omit<ProposalVote, "weight"> & {
  valoper?: string | null
  validator?: {
    identity?: string
    moniker: string
    tokens?: string
  }
  weight: bigint
}

type TallyStats = {
  flag: {
    label: string
    value: number
  }
  isPassing: boolean
  ratio: number
  total: number
  totalStaked: string
}

type ProposalVotesPanelProps = {
  filteredVotesCount: number
  keybasePictures: Record<string, string>
  proposalVotingEndTime?: string
  tallyStats: TallyStats
  totalVoteWeight: bigint
  visibleVotes: number
  visibleVotesByValidator: ValidatorVoteRow[]
  voteFilter: string
  voteRows: VoteRow[]
  voteTxHashes: Record<string, string>
  onChangeVoteFilter: (filter: string | ((previous: string) => string)) => void
  onLoadMoreVotes: () => void
}

const ProposalVotesPanel = ({
  filteredVotesCount,
  keybasePictures,
  proposalVotingEndTime,
  tallyStats,
  totalVoteWeight,
  visibleVotes,
  visibleVotesByValidator,
  voteFilter,
  voteRows,
  voteTxHashes,
  onChangeVoteFilter,
  onLoadMoreVotes
}: ProposalVotesPanelProps) => (
  <>
    <div className={`card ${styles.sectionCard}`}>
      <div className={styles.sectionHeader}>Votes</div>
      <div className={`${styles.sectionBody} ${styles.votesBody}`}>
        <div className={styles.voteGrid}>
          <div className={styles.voteTotals}>
            <div className={styles.voteTotalTitle}>Total voted</div>
            <div className={styles.voteTotalValue}>
              {formatTokenAmount(tallyStats.total, 6, 0)} LUNC{" "}
              <span className={styles.voteTotalPercent}>
                ({formatPercentPlain(tallyStats.ratio * 100)})
              </span>
            </div>
            <div className={styles.voteTotalMeta}>
              {tallyStats.isPassing ? "Passing..." : "Not passing..."}
            </div>
          </div>
          <div className={styles.voteList}>
            {voteRows.map((row) => (
              <article
                key={row.label}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onChangeVoteFilter((prev) =>
                    prev === row.filterKey ? "ALL" : row.filterKey
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onChangeVoteFilter((prev) =>
                      prev === row.filterKey ? "ALL" : row.filterKey
                    )
                  }
                }}
                className={`${styles.voteItem} ${styles.voteItemClickable} ${
                  row.itemClass
                } ${voteFilter === row.filterKey ? styles.voteItemActive : ""}`}
              >
                <div className={styles.voteItemTitle}>{row.label}</div>
                <div className={`${styles.voteItemRatio} ${row.textClass}`}>
                  {formatPercentPlain(row.value * 100)}
                </div>
                <div className={styles.voteItemAmount}>
                  {formatTokenAmount(row.amount, 6, 0)} LUNC
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.progressBlock}>
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              {voteRows.map((row) => (
                <div
                  key={row.label}
                  className={`${styles.progressSegment} ${row.segmentClass}`}
                  style={{ width: `${row.barValue * 100}%` }}
                />
              ))}
            </div>
            <ProposalVoteFlag
              label={tallyStats.flag.label}
              left={Math.min(100, tallyStats.flag.value * 100)}
            />
          </div>
          <div className={styles.voteMeta}>
            Voted: {formatTokenAmount(tallyStats.total, 6, 0)} /{" "}
            {formatTokenAmount(tallyStats.totalStaked, 6, 0)}
          </div>
          <div className={styles.voteEnd}>
            {proposalVotingEndTime
              ? `Ends ${formatTimestamp(proposalVotingEndTime)}`
              : "--"}
          </div>
        </div>
      </div>
    </div>

    {visibleVotesByValidator.length ? (
      <div className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHeader}>Votes by validator</div>
        <div className={styles.sectionBody}>
          <div className={styles.list}>
            {visibleVotesByValidator.map((vote) => {
              const weightPercent = getWeightPercent(
                vote.weight,
                totalVoteWeight
              )
              const badgeRight = Math.min(98, Math.max(0, weightPercent + 1))
              const txHash = vote.txhash ?? voteTxHashes[vote.voter]
              const txUrl = txHash
                ? `https://finder.burrito.money/classic/tx/${txHash}`
                : ""
              return (
                <div key={vote.voter}>
                  {txUrl ? (
                    <a
                      className={`${styles.validatorRow} ${styles.validatorLink}`}
                      href={txUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div
                        className={styles.validatorWeightBar}
                        style={{
                          width: `${weightPercent}%`,
                          backgroundColor: getVoteColor(vote.option)
                        }}
                      />
                      <span
                        className={styles.validatorVoteBadge}
                        style={{
                          color: getVoteColor(vote.option),
                          right: `${badgeRight}%`
                        }}
                      >
                        {formatVoteOption(vote.option)}
                      </span>
                      <div className={styles.validatorInfo}>
                        <img
                          className={styles.validatorAvatar}
                          src={
                            vote.validator?.identity
                              ? keybasePictures[vote.validator.identity] ||
                                "/system/validator.png"
                              : "/system/validator.png"
                          }
                          alt={vote.validator?.moniker ?? "Validator"}
                          onError={(event) => {
                            const target = event.currentTarget
                            target.onerror = null
                            target.src = "/system/validator.png"
                          }}
                        />
                        <div>
                          <div className={styles.validatorName}>
                            {vote.validator?.moniker ?? truncateHash(vote.voter)}
                          </div>
                          {!vote.validator?.moniker ? (
                            <div className={styles.validatorAddress}>
                              {vote.voter}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </a>
                  ) : (
                    <div className={styles.validatorRow}>
                      <div
                        className={styles.validatorWeightBar}
                        style={{
                          width: `${weightPercent}%`,
                          backgroundColor: getVoteColor(vote.option)
                        }}
                      />
                      <span
                        className={styles.validatorVoteBadge}
                        style={{
                          color: getVoteColor(vote.option),
                          right: `${badgeRight}%`
                        }}
                      >
                        {formatVoteOption(vote.option)}
                      </span>
                      <div className={styles.validatorInfo}>
                        <img
                          className={styles.validatorAvatar}
                          src={
                            vote.validator?.identity
                              ? keybasePictures[vote.validator.identity] ||
                                "/system/validator.png"
                              : "/system/validator.png"
                          }
                          alt={vote.validator?.moniker ?? "Validator"}
                          onError={(event) => {
                            const target = event.currentTarget
                            target.onerror = null
                            target.src = "/system/validator.png"
                          }}
                        />
                        <div>
                          <div className={styles.validatorName}>
                            {vote.validator?.moniker ?? truncateHash(vote.voter)}
                          </div>
                          {!vote.validator?.moniker ? (
                            <div className={styles.validatorAddress}>
                              {vote.voter}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {filteredVotesCount > visibleVotes ? (
              <div className={styles.loadMoreWrap}>
                <button
                  className="uiButton"
                  type="button"
                  onClick={onLoadMoreVotes}
                >
                  Load more
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
  </>
)

export default ProposalVotesPanel
