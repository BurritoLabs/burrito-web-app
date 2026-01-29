import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import { useLocation, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./ProposalDetails.module.css"
import {
  fetchProposalById,
  fetchProposalDeposits,
  fetchProposalTally,
  fetchProposalVotes,
  fetchProposalVoteTxHashes,
  fetchValidators,
  fetchStakingPool,
  fetchTallyParams,
  fetchDelegationsForVoters,
  type DelegationResponse
} from "../app/data/classic"
import {
  formatTimestamp,
  formatTokenAmount,
  truncateHash
} from "../app/utils/format"
import { convertBech32Prefix } from "../app/utils/bech32"
import { CLASSIC_DENOMS } from "../app/chain"
import type {
  GovTally,
  GovTallyParams,
  ProposalDeposit,
  ProposalItem,
  ProposalVote,
  StakingPool,
  ValidatorItem
} from "../app/data/classic"

const ProposalDetails = () => {
  const params = useParams()
  const proposalId = params.id ?? ""
  const location = useLocation()

  const { data: proposal } = useQuery<ProposalItem>({
    queryKey: ["proposal", proposalId],
    queryFn: () => fetchProposalById(proposalId),
    enabled: Boolean(proposalId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true
  })

  const { data: tally } = useQuery<GovTally>({
    queryKey: ["proposalTally", proposalId],
    queryFn: () => fetchProposalTally(proposalId),
    enabled: Boolean(proposalId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true
  })

  const { data: votes = [] } = useQuery<ProposalVote[]>({
    queryKey: ["proposalVotes", proposalId, proposal?.status],
    queryFn: () => fetchProposalVotes(proposalId, proposal?.status),
    enabled: Boolean(proposalId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true
  })

  const { data: deposits = [] } = useQuery<ProposalDeposit[]>({
    queryKey: ["proposalDeposits", proposalId],
    queryFn: () => fetchProposalDeposits(proposalId),
    enabled: Boolean(proposalId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  })

  const { data: validators = [] } = useQuery<ValidatorItem[]>({
    queryKey: ["validators"],
    queryFn: fetchValidators,
    staleTime: 5 * 60 * 1000
  })

  const { data: tallyParams } = useQuery<GovTallyParams>({
    queryKey: ["govTallyParams"],
    queryFn: fetchTallyParams,
    staleTime: 10 * 60 * 1000
  })

  const { data: stakingPool } = useQuery<StakingPool>({
    queryKey: ["stakingPool"],
    queryFn: fetchStakingPool,
    staleTime: 5 * 60 * 1000
  })

  const formatProposalType = (type?: string) => {
    if (!type) return "Proposal"
    const last = type.split(".").pop() ?? type
    const cleaned = last.replace("Proposal", "").replace(/^Msg/, "")
    const spaced = cleaned.replace(/([A-Z])/g, " $1").trim()
    const label = spaced.length ? spaced.toLowerCase() : "proposal"
    return last.startsWith("Msg") ? `Msg ${label}` : label
  }

  const statusLabel = useMemo(() => {
    const status = proposal?.status?.toUpperCase() ?? ""
    if (status.includes("VOTING")) return "Voting"
    if (status.includes("DEPOSIT")) return "Deposit"
    if (status.includes("PASSED")) return "Passed"
    if (status.includes("REJECTED")) return "Rejected"
    return "Status"
  }, [proposal?.status])

  const statusClass = useMemo(() => {
    switch (statusLabel) {
      case "Voting":
        return styles.statusVoting
      case "Deposit":
        return styles.statusDeposit
      case "Passed":
        return styles.statusPassed
      case "Rejected":
        return styles.statusRejected
      default:
        return ""
    }
  }, [statusLabel])

  const summaryItems = useMemo(() => {
    if (!proposal) return []
    const ignored = new Set([
      "@type",
      "title",
      "description",
      "summary",
      "details",
      "metadata",
      "authors",
      "proposal_forum_url",
      "vote_option_context"
    ])
    const items: Array<{ label: string; value: ReactNode }> = []
    const seen = new Set<string>()

    const pushEntries = (source?: Record<string, any>) => {
      if (!source) return
      Object.entries(source)
        .filter(([key]) => !ignored.has(key))
        .forEach(([key, value]) => {
          if (seen.has(key)) return
          seen.add(key)
          items.push({
            label: capitalize(key.replace(/_/g, " ")),
            value: renderSummaryValue(key, value)
          })
        })
    }

    pushEntries(proposal.metadataContent)
    pushEntries(proposal.content as Record<string, any>)
    return items
  }, [proposal])

  const validatorInfoMap = useMemo(() => {
    const map = new Map<
      string,
      { moniker: string; identity?: string; tokens?: string }
    >()
    validators.forEach((validator) => {
      const accAddress = convertBech32Prefix(
        validator.operator_address,
        "terra"
      )
      const info = {
        moniker: validator.description?.moniker ?? validator.operator_address,
        identity: validator.description?.identity,
        tokens: validator.tokens
      }
      map.set(validator.operator_address, info)
      if (accAddress) {
        map.set(accAddress, info)
      }
    })
    return map
  }, [validators])

  const voterAddresses = useMemo(
    () => votes.map((vote) => vote.voter).filter(Boolean),
    [votes]
  )

  const delegatorKey = useMemo(
    () => voterAddresses.slice().sort().join("|"),
    [voterAddresses]
  )

  const { data: delegationsByVoter = new Map<string, DelegationResponse[]>() } =
    useQuery({
      queryKey: ["proposalVoteDelegations", proposalId, delegatorKey],
      queryFn: () => fetchDelegationsForVoters(voterAddresses),
      enabled: voterAddresses.length > 0,
      staleTime: 5 * 60 * 1000
    })

  const votesByValidator = useMemo(() => {
    const toBigInt = (value?: string) => {
      try {
        if (!value) return 0n
        return BigInt(value)
      } catch {
        return 0n
      }
    }

    const validatorEffective = new Map<string, bigint>()
    validators.forEach((validator) => {
      const accAddress = convertBech32Prefix(
        validator.operator_address,
        "terra"
      )
      if (!accAddress) return
      const tokens = toBigInt(validator.tokens)
      validatorEffective.set(accAddress, tokens)
    })

    const delegatorPower = new Map<string, bigint>()
    voterAddresses.forEach((voter) => {
      const delegations = delegationsByVoter.get(voter) ?? []
      let total = 0n
      delegations.forEach((item) => {
        if (
          item.balance?.denom !== CLASSIC_DENOMS.lunc.coinMinimalDenom ||
          !item.balance?.amount
        )
          return
        const amount = toBigInt(item.balance.amount)
        total += amount
        const valAddress = item.delegation?.validator_address
        const valAcc = valAddress
          ? convertBech32Prefix(valAddress, "terra")
          : undefined
        if (valAcc && validatorEffective.has(valAcc)) {
          const current = validatorEffective.get(valAcc) ?? 0n
          validatorEffective.set(valAcc, current > amount ? current - amount : 0n)
        }
      })
      delegatorPower.set(voter, total)
    })

    const enriched = votes.map((vote) => {
      const valoper = convertBech32Prefix(vote.voter, "terravaloper")
      const validator =
        validatorInfoMap.get(vote.voter) ??
        (valoper ? validatorInfoMap.get(valoper) : undefined)
      const validatorAcc =
        validator && validatorEffective.has(vote.voter)
          ? vote.voter
          : validator
          ? convertBech32Prefix(vote.voter, "terra")
          : undefined
      const weight = validator
        ? validatorEffective.get(validatorAcc ?? "") ?? 0n
        : delegatorPower.get(vote.voter) ?? 0n
      return {
        ...vote,
        valoper,
        validator,
        weight
      }
    })

    return enriched.sort((a, b) =>
      a.weight === b.weight ? 0 : a.weight > b.weight ? -1 : 1
    )
  }, [validators, delegationsByVoter, validatorInfoMap, voterAddresses, votes])

  const [voteFilter, setVoteFilter] = useState("ALL")
  const [visibleVotes, setVisibleVotes] = useState(25)
  const [keybasePictures, setKeybasePictures] = useState<Record<string, string>>({})

  useEffect(() => {
    setVisibleVotes(25)
  }, [proposalId, votesByValidator.length, voteFilter])

  const normalizeVoteOption = (value: string) => {
    const upper = value.toUpperCase()
    if (upper.includes("YES")) return "YES"
    if (upper.includes("NO_WITH_VETO")) return "NO_WITH_VETO"
    if (upper.includes("NO")) return "NO"
    if (upper.includes("ABSTAIN")) return "ABSTAIN"
    return upper
  }

  const filteredVotesByValidator = useMemo(() => {
    if (voteFilter === "ALL") return votesByValidator
    return votesByValidator.filter(
      (vote) => normalizeVoteOption(vote.option) === voteFilter
    )
  }, [votesByValidator, voteFilter])

  const visibleVotesByValidator = useMemo(
    () => filteredVotesByValidator.slice(0, visibleVotes),
    [filteredVotesByValidator, visibleVotes]
  )

  const visibleVoters = useMemo(
    () => visibleVotesByValidator.map((vote) => vote.voter).filter(Boolean),
    [visibleVotesByValidator]
  )

  const { data: voteTxHashes = {} } = useQuery<Record<string, string>>({
    queryKey: ["proposalVoteTxs", proposalId, visibleVoters.join("|")],
    queryFn: () => fetchProposalVoteTxHashes(proposalId, visibleVoters),
    enabled: Boolean(proposalId) && visibleVoters.length > 0,
    staleTime: 5 * 60 * 1000
  })

  const totalVoteWeight = useMemo(() => {
    let total = 0n
    votesByValidator.forEach((vote) => {
      total += vote.weight
    })
    return total
  }, [votesByValidator])

  useEffect(() => {
    let cancelled = false
    const identities = visibleVotesByValidator
      .map((vote) => vote.validator?.identity)
      .filter((id): id is string => Boolean(id))

    const pending = identities.filter((id) => !(id in keybasePictures))
    if (!pending.length) return undefined

    const load = async () => {
      const results = await Promise.all(
        pending.map(async (identity) => {
          try {
            const response = await fetch(
              `https://keybase.burrito.money/?identity=${identity}`
            )
            const data = await response.json()
            return [identity, data?.picture ?? ""] as const
          } catch {
            return [identity, ""] as const
          }
        })
      )
      if (cancelled) return
      setKeybasePictures((prev) => {
        const next = { ...prev }
        results.forEach(([identity, picture]) => {
          next[identity] = picture
        })
        return next
      })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [keybasePictures, visibleVotesByValidator])

  const description = proposal?.description ?? proposal?.summary ?? "--"

  const [showDetails, setShowDetails] = useState(false)

  const parsedDescription = useMemo(() => {
    if (!description || description === "--") return []
    const lines = description.split(/\n/)
    const linkify = (text: string) => {
      const nodes: ReactNode[] = []
      const pattern = /(https?:\/\/[^\s]+)/g
      let lastIndex = 0
      let match = pattern.exec(text)
      while (match) {
        if (match.index > lastIndex) {
          nodes.push(text.slice(lastIndex, match.index))
        }
        const url = match[0]
        nodes.push(
          <a
            key={`${match.index}-${url}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={styles.summaryLink}
          >
            {url}
          </a>
        )
        lastIndex = match.index + url.length
        match = pattern.exec(text)
      }
      if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex))
      }
      return nodes
    }
    return lines.map((line, index) => {
      if (line.startsWith("# ")) {
        return (
          <h3 key={index} className={styles.descHeading}>
            {line.replace("# ", "")}
          </h3>
        )
      }
      if (line.startsWith("## ")) {
        return (
          <h4 key={index} className={styles.descHeading}>
            {line.replace("## ", "")}
          </h4>
        )
      }
      if (line.startsWith("- ")) {
        return (
          <li key={index} className={styles.descListItem}>
            {linkify(line.replace("- ", ""))}
          </li>
        )
      }
      return (
        <p key={index} className={styles.descParagraph}>
          {linkify(line)}
        </p>
      )
    })
  }, [description])

  const metadata = proposal?.metadataContent as Record<string, any> | undefined
  const authors = metadata?.authors
  const forumUrl = metadata?.proposal_forum_url
  const voteContext = metadata?.vote_option_context
  const forumLabel = (() => {
    if (!forumUrl || typeof forumUrl !== "string") return ""
    try {
      const url = new URL(forumUrl)
      const parts = url.pathname.split("/").filter(Boolean)
      return parts[parts.length - 1] ?? forumUrl
    } catch {
      return forumUrl
    }
  })()

  const tallyStats = useMemo(() => {
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

    const yesBig = toBigInt(tally?.yes)
    const noBig = toBigInt(tally?.no)
    const abstainBig = toBigInt(tally?.abstain)
    const vetoBig = toBigInt(tally?.noWithVeto)
    const totalBig = yesBig + noBig + abstainBig + vetoBig
    const totalStakedBig = toBigInt(stakingPool?.bonded_tokens?.amount)
    const ratio = safeRatio(totalBig, totalStakedBig)
    const byVoted = {
      yes: safeRatio(yesBig, totalBig),
      no: safeRatio(noBig, totalBig),
      abstain: safeRatio(abstainBig, totalBig),
      veto: safeRatio(vetoBig, totalBig)
    }

    const byStaked = {
      yes: byVoted.yes * ratio,
      no: byVoted.no * ratio,
      abstain: byVoted.abstain * ratio,
      veto: byVoted.veto * ratio
    }

    const quorum = tallyParams?.quorum ?? 0
    const threshold = tallyParams?.threshold ?? 0
    const vetoThreshold = tallyParams?.vetoThreshold ?? 0
    const determinantThreshold = byVoted.yes + byVoted.no + byVoted.veto
    const thresholdX = threshold * determinantThreshold * ratio
    const isBelowQuorum = quorum > ratio
    const flag = {
      value: isBelowQuorum ? quorum : thresholdX,
      label: isBelowQuorum ? "Quorum" : "Pass threshold"
    }
    const isPassing = !isBelowQuorum && byVoted.yes >= byVoted.no + byVoted.veto

    return {
      total: Number(totalBig),
      totalStaked: totalStakedBig.toString(),
      ratio,
      byVoted,
      byStaked,
      flag,
      isPassing,
      vetoThreshold
    }
  }, [stakingPool?.bonded_tokens?.amount, tally, tallyParams])

  const voteRows = [
    {
      label: "Yes",
      value: tallyStats.byVoted.yes,
      barValue: tallyStats.byStaked.yes,
      amount: tally?.yes ?? "0",
      textClass: styles.voteYes,
      segmentClass: styles.segmentYes,
      itemClass: styles.voteCardYes,
      filterKey: "YES"
    },
    {
      label: "No",
      value: tallyStats.byVoted.no,
      barValue: tallyStats.byStaked.no,
      amount: tally?.no ?? "0",
      textClass: styles.voteNo,
      segmentClass: styles.segmentNo,
      itemClass: styles.voteCardNo,
      filterKey: "NO"
    },
    {
      label: "No with veto",
      value: tallyStats.byVoted.veto,
      barValue: tallyStats.byStaked.veto,
      amount: tally?.noWithVeto ?? "0",
      textClass: styles.voteVeto,
      segmentClass: styles.segmentVeto,
      itemClass: styles.voteCardVeto,
      filterKey: "NO_WITH_VETO"
    },
    {
      label: "Abstain",
      value: tallyStats.byVoted.abstain,
      barValue: tallyStats.byStaked.abstain,
      amount: tally?.abstain ?? "0",
      textClass: styles.voteAbstain,
      segmentClass: styles.segmentAbstain,
      itemClass: styles.voteCardAbstain,
      filterKey: "ABSTAIN"
    }
  ]

  const actionLabel =
    statusLabel === "Voting" ? "Vote" : statusLabel === "Deposit" ? "Deposit" : null

  const backTo =
    (location.state as { from?: string } | undefined)?.from ?? "/gov"

  return (
    <PageShell
      title="Proposal details"
      backTo={backTo}
      backLabel=""
      extra={
        actionLabel ? (
          <button className="uiButton uiButtonPrimary" type="button">
            {actionLabel}
          </button>
        ) : null
      }
    >
      <div className={styles.detailGrid}>
        <div className={styles.mainColumn}>
          <div className={`card ${styles.detailCard}`}>
            <div className={styles.headerMeta}>
              <div className={styles.metaLeft}>
                <span>
                  {proposal?.id ? `#${proposal.id}` : "--"} |{" "}
                  {formatProposalType(proposal?.contentType)}
                </span>
              </div>
              <span className={`${styles.statusPill} ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
            <h2 className={styles.detailTitle}>
              {proposal?.title ?? "Proposal"}
            </h2>
            <div className={styles.detailDate}>
              Submitted{" "}
              {proposal?.submitTime ? formatTimestamp(proposal.submitTime) : "--"}
            </div>
            <button
              className={styles.detailsToggle}
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
            {showDetails ? (
              <>
                <div className={styles.description}>{parsedDescription}</div>
                <div className={styles.detailsList}>
                  {authors ? (
                    <div className={styles.detailsRow}>
                      <div className={styles.detailsLabel}>Authors</div>
                      <div className={styles.detailsValue}>
                        {Array.isArray(authors) ? authors.join(", ") : String(authors)}
                      </div>
                    </div>
                  ) : null}
                  {forumUrl ? (
                    <div className={styles.detailsRow}>
                      <div className={styles.detailsLabel}>Proposal forum url</div>
                      <div className={styles.detailsValue}>
                        <a
                          className={styles.summaryLink}
                          href={forumUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {forumLabel || forumUrl}
                        </a>
                      </div>
                    </div>
                  ) : null}
                  {voteContext ? (
                    <div className={styles.detailsRow}>
                      <div className={styles.detailsLabel}>Vote option context</div>
                      <div className={styles.detailsValue}>{String(voteContext)}</div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className={styles.sideColumn}>
          <div className={`card ${styles.summaryCard}`}>
            <div className={styles.summaryList}>
              {summaryItems.length ? (
                summaryItems.map((item) => (
                  <div key={item.label} className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>{item.label}</div>
                    <div className={styles.summaryValue}>{item.value}</div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>No details available.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {statusLabel === "Deposit" ? (
        <div className={`card ${styles.sectionCard}`}>
          <div className={styles.sectionHeader}>Deposits</div>
          <div className={styles.sectionBody}>
            {deposits.length ? (
              <div className={styles.list}>
                {deposits.map((deposit) => (
                  <div key={deposit.depositor} className={styles.listRow}>
                    <div className={styles.listName}>{deposit.depositor}</div>
                    <div className={styles.listValue}>
                      {deposit.amount
                        .map(
                          (coin) =>
                            `${formatTokenAmount(coin.amount, 6, 2)} ${formatDenom(
                              coin.denom
                            )}`
                        )
                        .join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No deposits yet.</div>
            )}
          </div>
        </div>
      ) : null}

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
                    setVoteFilter((prev) =>
                      prev === row.filterKey ? "ALL" : row.filterKey
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setVoteFilter((prev) =>
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
              <VoteFlag
                label={tallyStats.flag.label}
                left={Math.min(100, tallyStats.flag.value * 100)}
              />
            </div>
            <div className={styles.voteMeta}>
              Voted: {formatTokenAmount(tallyStats.total, 6, 0)} /{" "}
              {formatTokenAmount(tallyStats.totalStaked, 6, 0)}
            </div>
            <div className={styles.voteEnd}>
              {proposal?.votingEndTime
                ? `Ends ${formatTimestamp(proposal.votingEndTime)}`
                : "--"}
            </div>
          </div>
        </div>
      </div>

      {votesByValidator.length ? (
        <div className={`card ${styles.sectionCard}`}>
          <div className={styles.sectionHeader}>Votes by validator</div>
          <div className={styles.sectionBody}>
            <div className={styles.list}>
              {visibleVotesByValidator.map((vote) => {
                const weightPercent = getWeightPercent(vote.weight, totalVoteWeight)
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
              {filteredVotesByValidator.length > visibleVotes ? (
                <div className={styles.loadMoreWrap}>
                  <button
                    className="uiButton"
                    type="button"
                    onClick={() => setVisibleVotes((prev) => prev + 25)}
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`card ${styles.tallyCard}`}>
        <div className={styles.tallyHeader}>Tallying procedure</div>
        <div className={styles.tallyBody}>
          <div className={styles.tallyItem}>
            <div className={styles.tallyLabel}>Quorum</div>
            <div className={styles.tallyValue}>
              {tallyParams
                ? formatPercentPlain((tallyParams.quorum ?? 0) * 100)
                : "--"}
            </div>
          </div>
          <div className={styles.tallyItem}>
            <div className={styles.tallyLabel}>Pass threshold</div>
            <div className={styles.tallyValue}>
              {tallyParams
                ? formatPercentPlain((tallyParams.threshold ?? 0) * 100)
                : "--"}
            </div>
          </div>
          <div className={styles.tallyItem}>
            <div className={styles.tallyLabel}>Veto threshold</div>
            <div className={styles.tallyValue}>
              {tallyParams
                ? formatPercentPlain((tallyParams.vetoThreshold ?? 0) * 100)
                : "--"}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

const VoteFlag = ({ label, left }: { label: string; left: number }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    if (ref.current) {
      setWidth(ref.current.offsetWidth)
    }
  }, [label, left])

  let maxTranslate = 45
  if (label.toLowerCase().includes("quorum")) maxTranslate = 24
  const computed =
    (left / 100) * width < maxTranslate ? `-${(left / 100) * width}px` : "-50%"

  return (
    <div
      ref={ref}
      className={styles.progressFlag}
      style={{ ["--flag-left" as any]: `${left}%`, ["--x-pos" as any]: computed }}
    >
      <span className={styles.progressFlagLabel}>{label}</span>
      <span className={styles.progressFlagLine} />
    </div>
  )
}

const formatDenom = (denom: string) => {
  if (!denom) return "--"
  if (denom === "uluna") return "LUNC"
  if (denom === "uusd") return "USTC"
  if (denom.startsWith("u")) {
    const f = denom.slice(1)
    if (f.length > 3) {
      return f.toUpperCase()
    }
    return f.slice(0, 2).toUpperCase() + "T"
  }
  return denom.toUpperCase()
}

const formatVoteOption = (value: string) => {
  const upper = value.toUpperCase()
  if (upper.includes("YES")) return "Yes"
  if (upper.includes("NO_WITH_VETO")) return "No with veto"
  if (upper.includes("NO")) return "No"
  if (upper.includes("ABSTAIN")) return "Abstain"
  return value
}

const getVoteColor = (value: string) => {
  const upper = value.toUpperCase()
  if (upper.includes("YES")) return "#52c41a"
  if (upper.includes("NO_WITH_VETO")) return "#ff4d4f"
  if (upper.includes("NO")) return "#ff7aa2"
  if (upper.includes("ABSTAIN")) return "#f6c343"
  return "rgba(255,255,255,0.12)"
}

const getWeightPercent = (value: bigint, total: bigint) => {
  if (total <= 0n) return 0
  const scaled = (value * 10000n) / total
  return Math.min(100, Number(scaled) / 100)
}

const formatPercentPlain = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return `${value.toFixed(2)}%`
}

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value

const renderSummaryValue = (key: string, value: unknown) => {
  if (Array.isArray(value)) {
    if (!value.length) return "--"
    const first = value[0] as any
    if (first && typeof first === "object" && "denom" in first && "amount" in first) {
      return value
        .map((coin: any) =>
          `${formatTokenAmount(coin.amount, 6, 2)} ${formatDenom(coin.denom)}`
        )
        .join(", ")
    }
    return JSON.stringify(value)
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2)
  }
  if (value === undefined || value === null) return "--"
  const text = String(value)
  const isAddress =
    /^terra1[0-9a-z]{38,}$/.test(text) || /^terra[0-9a-z]{38,}$/.test(text)
  if (isAddress) {
    const href = `https://finder.burrito.money/classic/address/${text}`
    return (
      <a
        className={styles.summaryLink}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {truncateHash(text)}
      </a>
    )
  }
  if (key.toLowerCase() === "recipient" && text) {
    const href = `https://finder.burrito.money/classic/address/${text}`
    return (
      <a
        className={styles.summaryLink}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {truncateHash(text)}
      </a>
    )
  }
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return (
      <a className={styles.summaryLink} href={text} target="_blank" rel="noreferrer">
        {text}
      </a>
    )
  }
  return text
}

export default ProposalDetails
