import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react"
import { createPortal } from "react-dom"
import { useLocation, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SigningStargateClient } from "@cosmjs/stargate"
import { MsgDeposit, MsgVote } from "cosmjs-types/cosmos/gov/v1beta1/tx"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import PageShell from "./PageShell"
import styles from "./ProposalDetails.module.css"
import {
  fetchBalances,
  fetchDepositParams,
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
  toUnitAmount,
  formatTokenAmount,
  truncateHash
} from "../app/utils/format"
import { convertBech32Prefix } from "../app/utils/bech32"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../app/chain"
import { useWallet } from "../app/wallet/WalletContext"
import { connectClassicStargateClientForConnector } from "../app/wallet/walletAdapters"
import type {
  CoinBalance,
  GovDepositParams,
  GovTally,
  GovTallyParams,
  ProposalDeposit,
  ProposalItem,
  ProposalVote,
  StakingPool,
  ValidatorItem
} from "../app/data/classic"

const GAS_PRICE_MICRO = 28.325
const VOTE_GAS_LIMIT = 220000
const DEPOSIT_GAS_LIMIT = 220000
const KEYBASE_PROXY_URL = import.meta.env.DEV
  ? "/keybase"
  : "https://keybase.burrito.money"

type SummaryMap = Record<string, unknown>
type SummaryCoin = { denom: string; amount: string | number | bigint }

const isSummaryMap = (value: unknown): value is SummaryMap =>
  typeof value === "object" && value !== null

const isSummaryCoin = (value: unknown): value is SummaryCoin =>
  isSummaryMap(value) &&
  typeof value.denom === "string" &&
  (typeof value.amount === "string" ||
    typeof value.amount === "number" ||
    typeof value.amount === "bigint")

const parseSequenceMismatchExpected = (message: string) => {
  const matched = message.match(/expected\s+(\d+)\s*,\s*got\s+\d+/i)
  if (!matched) return undefined
  const value = Number(matched[1])
  return Number.isFinite(value) ? value : undefined
}

const toSafeBigInt = (value?: string | number | bigint) => {
  try {
    if (value === undefined || value === null || value === "") return 0n
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(Math.trunc(value))
    return BigInt(value)
  } catch {
    return 0n
  }
}

const toMicroAmount = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

type VoteChoice = "YES" | "NO" | "NO_WITH_VETO" | "ABSTAIN"

const VOTE_OPTION_VALUES: Record<VoteChoice, number> = {
  YES: 1,
  ABSTAIN: 2,
  NO: 3,
  NO_WITH_VETO: 4
}

const ProposalDetails = () => {
  const params = useParams()
  const proposalId = params.id ?? ""
  const location = useLocation()
  const queryClient = useQueryClient()
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const [voteModalOpen, setVoteModalOpen] = useState(false)
  const [voteChoice, setVoteChoice] = useState<VoteChoice>("YES")
  const [voteSubmitting, setVoteSubmitting] = useState(false)
  const [voteError, setVoteError] = useState<string>()
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState("")
  const [depositSubmitting, setDepositSubmitting] = useState(false)
  const [depositError, setDepositError] = useState<string>()

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

  const { data: depositParams } = useQuery<GovDepositParams>({
    queryKey: ["govDepositParams"],
    queryFn: fetchDepositParams,
    staleTime: 10 * 60 * 1000
  })

  const { data: balances = [] } = useQuery<CoinBalance[]>({
    queryKey: ["balances", account?.address],
    queryFn: () => fetchBalances(account?.address ?? ""),
    enabled: Boolean(account?.address)
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

    const pushEntries = (source?: SummaryMap) => {
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

    pushEntries(
      isSummaryMap(proposal.metadataContent)
        ? proposal.metadataContent
        : undefined
    )
    pushEntries(isSummaryMap(proposal.content) ? proposal.content : undefined)
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
              `${KEYBASE_PROXY_URL}/?identity=${identity}`
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

  const metadata = isSummaryMap(proposal?.metadataContent)
    ? proposal.metadataContent
    : undefined
  const authors = metadata?.authors
  const forumUrl =
    typeof metadata?.proposal_forum_url === "string"
      ? metadata.proposal_forum_url
      : undefined
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

  const luncBalance = useMemo(() => {
    const item = balances.find(
      (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    return item?.amount ?? "0"
  }, [balances])

  const minDepositCoins = useMemo(
    () => depositParams?.minDeposit ?? [],
    [depositParams?.minDeposit]
  )

  const depositTotals = useMemo(() => {
    const totals = new Map<string, bigint>()
    deposits.forEach((deposit) => {
      deposit.amount.forEach((coin) => {
        const current = totals.get(coin.denom) ?? 0n
        totals.set(coin.denom, current + toSafeBigInt(coin.amount))
      })
    })

    const proposalDepositMicro = toSafeBigInt(proposal?.deposit)
    if (proposalDepositMicro > 0n) {
      const current = totals.get(CLASSIC_DENOMS.lunc.coinMinimalDenom) ?? 0n
      if (proposalDepositMicro > current) {
        totals.set(CLASSIC_DENOMS.lunc.coinMinimalDenom, proposalDepositMicro)
      }
    }
    return totals
  }, [deposits, proposal?.deposit])

  const primaryDepositDenom =
    minDepositCoins[0]?.denom ?? CLASSIC_DENOMS.lunc.coinMinimalDenom

  const currentDepositMicro =
    depositTotals.get(primaryDepositDenom) ??
    (primaryDepositDenom === CLASSIC_DENOMS.lunc.coinMinimalDenom
      ? toSafeBigInt(proposal?.deposit)
      : 0n)

  const minDepositMicro =
    toSafeBigInt(
      minDepositCoins.find((coin) => coin.denom === primaryDepositDenom)?.amount
    ) || toSafeBigInt(minDepositCoins[0]?.amount)

  const remainingDepositMicro =
    minDepositMicro > currentDepositMicro
      ? minDepositMicro - currentDepositMicro
      : 0n

  const depositProgressPercent =
    minDepositMicro <= 0n
      ? 0
      : Math.min(
          100,
          Number((currentDepositMicro * 10000n) / minDepositMicro) / 100
        )

  const currentDepositCoins = useMemo(() => {
    if (depositTotals.size) {
      return Array.from(depositTotals.entries()).map(([denom, amount]) => ({
        denom,
        amount: amount.toString()
      }))
    }
    const proposalDepositMicro = toSafeBigInt(proposal?.deposit)
    if (proposalDepositMicro <= 0n) return []
    return [
      {
        denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        amount: proposalDepositMicro.toString()
      }
    ]
  }, [depositTotals, proposal?.deposit])

  const minDepositLabel = useMemo(
    () =>
      minDepositCoins.length
        ? formatCoinList(minDepositCoins)
        : `-- ${formatDenom(primaryDepositDenom)}`,
    [minDepositCoins, primaryDepositDenom]
  )

  const currentDepositLabel = useMemo(
    () =>
      currentDepositCoins.length
        ? formatCoinList(currentDepositCoins)
        : `0 ${formatDenom(primaryDepositDenom)}`,
    [currentDepositCoins, primaryDepositDenom]
  )

  const remainingDepositLabel = useMemo(
    () =>
      remainingDepositMicro > 0n
        ? `${formatTokenAmount(
            remainingDepositMicro.toString(),
            6,
            2
          )} ${formatDenom(primaryDepositDenom)}`
        : `0 ${formatDenom(primaryDepositDenom)}`,
    [primaryDepositDenom, remainingDepositMicro]
  )

  const luncBalanceLabel = useMemo(
    () =>
      `${formatTokenAmount(
        luncBalance,
        6,
        2
      )} ${CLASSIC_DENOMS.lunc.coinDenom}`,
    [luncBalance]
  )

  const depositStats = useMemo(() => {
    const progress = depositProgressPercent.toFixed(2)
    const maxPeriodSeconds = depositParams?.maxDepositPeriodSeconds ?? 0
    return {
      current: currentDepositLabel,
      minimum: minDepositLabel,
      remaining: remainingDepositLabel,
      progressLabel: `${progress}% funded`,
      maxPeriod:
        maxPeriodSeconds > 0 ? formatDurationLabel(maxPeriodSeconds) : "--"
    }
  }, [
    currentDepositLabel,
    depositParams?.maxDepositPeriodSeconds,
    depositProgressPercent,
    minDepositLabel,
    remainingDepositLabel
  ])

  const depositAmountMicro = useMemo(
    () => toSafeBigInt(toMicroAmount(depositAmount)),
    [depositAmount]
  )

  const depositAmountValue = useMemo(
    () => toUnitAmount(depositAmountMicro.toString(), 6),
    [depositAmountMicro]
  )

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

  const isVotingPeriod = statusLabel === "Voting"
  const isDepositPeriod = statusLabel === "Deposit"
  const canVote = isVotingPeriod && Boolean(account?.address)
  const canDeposit = isDepositPeriod && Boolean(account?.address)
  const actionLabel = isVotingPeriod
    ? canVote
      ? "Vote"
      : "Connect wallet"
    : isDepositPeriod
    ? canDeposit
      ? "Deposit"
      : "Connect wallet"
    : null
  const actionDisabled = isVotingPeriod
    ? !canVote
    : isDepositPeriod
    ? !canDeposit
    : true

  const backTo =
    (location.state as { from?: string } | undefined)?.from ?? "/gov"

  const submitVote = async () => {
    if (!proposalId) return
    if (!account?.address) {
      setVoteError("Please connect a wallet first.")
      return
    }

    try {
      setVoteSubmitting(true)
      setVoteError(undefined)
      startTx("Vote proposal")
      if (!connectorId) throw new Error("Wallet not connected")
      let proposalIdValue: bigint
      try {
        proposalIdValue = BigInt(proposalId)
      } catch {
        throw new Error("Invalid proposal id")
      }

      const msg = {
        typeUrl: "/cosmos.gov.v1beta1.MsgVote",
        value: MsgVote.fromPartial({
          proposalId: proposalIdValue,
          voter: account.address,
          option: VOTE_OPTION_VALUES[voteChoice]
        })
      }
      const feeAmount = Math.max(
        1,
        Math.ceil(VOTE_GAS_LIMIT * GAS_PRICE_MICRO)
      ).toString()
      const fee = {
        amount: [
          {
            amount: feeAmount,
            denom: CLASSIC_DENOMS.lunc.coinMinimalDenom
          }
        ],
        gas: String(VOTE_GAS_LIMIT)
      }

      let sequenceHint: number | undefined
      let result:
        | Awaited<ReturnType<SigningStargateClient["broadcastTxSync"]>>
        | undefined

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const client = await connectClassicStargateClientForConnector(
            connectorId
          )
          const signerState = await client.getSequence(account.address)
          const sequenceToUse = sequenceHint ?? signerState.sequence

          const signed = await client.sign(
            account.address,
            [msg],
            fee,
            "",
            {
              accountNumber: signerState.accountNumber,
              sequence: Number(sequenceToUse),
              chainId: CLASSIC_CHAIN.chainId
            }
          )
          const txBytes = TxRaw.encode(signed).finish()
          const txHash = await client.broadcastTxSync(txBytes)
          if (!txHash) {
            throw new Error("Vote transaction failed")
          }
          result = txHash
          break
        } catch (innerErr) {
          const message =
            innerErr instanceof Error ? innerErr.message : String(innerErr)
          const expectedSequence = parseSequenceMismatchExpected(message)
          if (expectedSequence !== undefined && attempt < 2) {
            sequenceHint = expectedSequence
            await new Promise((resolve) => setTimeout(resolve, 220))
            continue
          }
          throw innerErr
        }
      }

      if (!result) {
        throw new Error("Vote transaction failed")
      }

      finishTx(result)
      setVoteModalOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] }),
        queryClient.invalidateQueries({ queryKey: ["proposalTally", proposalId] }),
        queryClient.invalidateQueries({ queryKey: ["proposalVotes", proposalId] })
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vote failed"
      failTx(message)
      setVoteError(message)
    } finally {
      setVoteSubmitting(false)
    }
  }

  const depositValidationMessage = useMemo(() => {
    if (!account?.address) return "Please connect a wallet first."
    if (depositAmountMicro <= 0n) return "Enter an amount greater than zero."
    if (depositAmountMicro > toSafeBigInt(luncBalance)) {
      return "Insufficient LUNC balance."
    }
    return undefined
  }, [account?.address, depositAmountMicro, luncBalance])

  const submitDeposit = async () => {
    if (!proposalId) return
    if (!account?.address) {
      setDepositError("Please connect a wallet first.")
      return
    }
    if (depositAmountMicro <= 0n) {
      setDepositError("Enter an amount greater than zero.")
      return
    }
    if (depositAmountMicro > toSafeBigInt(luncBalance)) {
      setDepositError("Insufficient LUNC balance.")
      return
    }

    try {
      setDepositSubmitting(true)
      setDepositError(undefined)
      startTx("Deposit proposal")
      if (!connectorId) throw new Error("Wallet not connected")

      let proposalIdValue: bigint
      try {
        proposalIdValue = BigInt(proposalId)
      } catch {
        throw new Error("Invalid proposal id")
      }

      const msg = {
        typeUrl: "/cosmos.gov.v1beta1.MsgDeposit",
        value: MsgDeposit.fromPartial({
          proposalId: proposalIdValue,
          depositor: account.address,
          amount: [
            {
              denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
              amount: depositAmountMicro.toString()
            }
          ]
        })
      }

      const feeAmount = Math.max(
        1,
        Math.ceil(DEPOSIT_GAS_LIMIT * GAS_PRICE_MICRO)
      ).toString()
      const fee = {
        amount: [
          {
            amount: feeAmount,
            denom: CLASSIC_DENOMS.lunc.coinMinimalDenom
          }
        ],
        gas: String(DEPOSIT_GAS_LIMIT)
      }

      let sequenceHint: number | undefined
      let result:
        | Awaited<ReturnType<SigningStargateClient["broadcastTxSync"]>>
        | undefined

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const client = await connectClassicStargateClientForConnector(
            connectorId
          )
          const signerState = await client.getSequence(account.address)
          const sequenceToUse = sequenceHint ?? signerState.sequence

          const signed = await client.sign(
            account.address,
            [msg],
            fee,
            "",
            {
              accountNumber: signerState.accountNumber,
              sequence: Number(sequenceToUse),
              chainId: CLASSIC_CHAIN.chainId
            }
          )
          const txBytes = TxRaw.encode(signed).finish()
          const txHash = await client.broadcastTxSync(txBytes)
          if (!txHash) {
            throw new Error("Deposit transaction failed")
          }
          result = txHash
          break
        } catch (innerErr) {
          const message =
            innerErr instanceof Error ? innerErr.message : String(innerErr)
          const expectedSequence = parseSequenceMismatchExpected(message)
          if (expectedSequence !== undefined && attempt < 2) {
            sequenceHint = expectedSequence
            await new Promise((resolve) => setTimeout(resolve, 220))
            continue
          }
          throw innerErr
        }
      }

      if (!result) {
        throw new Error("Deposit transaction failed")
      }

      finishTx(result)
      setDepositModalOpen(false)
      setDepositAmount("")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] }),
        queryClient.invalidateQueries({
          queryKey: ["proposalDeposits", proposalId]
        }),
        queryClient.invalidateQueries({ queryKey: ["proposals"] }),
        queryClient.invalidateQueries({
          queryKey: ["balances", account.address]
        })
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deposit failed"
      failTx(message)
      setDepositError(message)
    } finally {
      setDepositSubmitting(false)
    }
  }

  useEffect(() => {
    if (!voteModalOpen) return
    setVoteError(undefined)
  }, [voteModalOpen])

  useEffect(() => {
    if (!depositModalOpen) return
    setDepositError(undefined)
  }, [depositModalOpen])

  useEffect(() => {
    const state = location.state as { openDeposit?: boolean } | undefined
    if (!state?.openDeposit || !isDepositPeriod) return
    setDepositModalOpen(true)
  }, [isDepositPeriod, location.state])

  return (
    <PageShell
      title="Proposal details"
      backTo={backTo}
      backLabel=""
      extra={
        actionLabel ? (
          <button
            className="uiButton uiButtonPrimary"
            type="button"
            onClick={() => {
              if (isVotingPeriod) {
                setVoteModalOpen(true)
                return
              }
              if (isDepositPeriod) {
                setDepositModalOpen(true)
              }
            }}
            disabled={actionDisabled}
          >
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
          <div className={`${styles.sectionBody} ${styles.depositBody}`}>
            <div className={styles.depositSummary}>
              <div className={styles.depositSummaryGrid}>
                <div className={styles.depositMetric}>
                  <div className={styles.depositMetricLabel}>Current deposited</div>
                  <div className={styles.depositMetricValue}>
                    {depositStats.current}
                  </div>
                </div>
                <div className={styles.depositMetric}>
                  <div className={styles.depositMetricLabel}>Minimum required</div>
                  <div className={styles.depositMetricValue}>
                    {depositStats.minimum}
                  </div>
                </div>
                <div className={styles.depositMetric}>
                  <div className={styles.depositMetricLabel}>Remaining</div>
                  <div className={styles.depositMetricValue}>
                    {depositStats.remaining}
                  </div>
                </div>
                <div className={styles.depositMetric}>
                  <div className={styles.depositMetricLabel}>Deposit period</div>
                  <div className={styles.depositMetricValue}>
                    {proposal?.depositEndTime
                      ? `Ends ${formatTimestamp(proposal.depositEndTime)}`
                      : depositStats.maxPeriod}
                  </div>
                </div>
              </div>

              <div className={styles.depositProgressBlock}>
                <div className={styles.depositProgressHeader}>
                  <span className={styles.depositProgressLabel}>
                    Deposit progress
                  </span>
                  <span className={styles.depositProgressValue}>
                    {depositStats.progressLabel}
                  </span>
                </div>
                <div className={styles.depositProgressTrack}>
                  <div
                    className={styles.depositProgressFill}
                    style={{ width: `${depositProgressPercent}%` }}
                  />
                </div>
                <div className={styles.depositProgressMeta}>
                  {account?.address ? (
                    <span>Your balance: {luncBalanceLabel}</span>
                  ) : (
                    <span>Connect a wallet to contribute to this proposal.</span>
                  )}
                  {canDeposit ? (
                    <button
                      type="button"
                      className="uiButton uiButtonPrimary"
                      onClick={() => setDepositModalOpen(true)}
                    >
                      Deposit
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {deposits.length ? (
              <div className={styles.list}>
                {deposits.map((deposit, index) => (
                  <div
                    key={`${deposit.depositor}-${index}`}
                    className={styles.listRow}
                  >
                    <div className={styles.listName}>{deposit.depositor}</div>
                    <div className={styles.listValue}>{formatCoinList(deposit.amount)}</div>
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

      {depositModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.voteModalBackdrop}
              role="dialog"
              aria-modal="true"
              onClick={() => {
                if (depositSubmitting) return
                setDepositModalOpen(false)
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
                      setDepositModalOpen(false)
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
                      <strong>{depositStats.current}</strong>
                    </div>
                    <div className={styles.depositModalRow}>
                      <span>Minimum required</span>
                      <strong>{depositStats.minimum}</strong>
                    </div>
                    <div className={styles.depositModalRow}>
                      <span>Remaining</span>
                      <strong>{depositStats.remaining}</strong>
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
                        onClick={() =>
                          setDepositAmount(formatAmountInput(luncBalance))
                        }
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
                          setDepositAmount(sanitizeDecimalInput(event.target.value))
                        }
                        placeholder="0.0"
                        disabled={depositSubmitting}
                      />
                      <span className={styles.depositAmountDenom}>LUNC</span>
                    </div>
                    <div className={styles.depositFieldHint}>
                      Deposit end:{" "}
                      {proposal?.depositEndTime
                        ? formatTimestamp(proposal.depositEndTime)
                        : "--"}
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
                        ? `${formatTokenAmount(
                            depositAmountMicro.toString(),
                            6,
                            6
                          )} LUNC`
                        : "--"}
                      .
                    </div>
                  )}
                </div>

                <div className={styles.voteModalActions}>
                  <button
                    type="button"
                    className="uiButton uiButtonOutline"
                    onClick={() => setDepositModalOpen(false)}
                    disabled={depositSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="uiButton uiButtonPrimary"
                    onClick={submitDeposit}
                    disabled={depositSubmitting || Boolean(depositValidationMessage)}
                  >
                    {depositSubmitting ? "Submitting..." : "Deposit"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {voteModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.voteModalBackdrop}
              role="dialog"
              aria-modal="true"
              onClick={() => {
                if (voteSubmitting) return
                setVoteModalOpen(false)
              }}
            >
              <div
                className={styles.voteModal}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.voteModalHeader}>
                  <div className={styles.voteModalTitle}>Vote proposal</div>
                  <button
                    type="button"
                    className={styles.voteModalClose}
                    onClick={() => {
                      if (voteSubmitting) return
                      setVoteModalOpen(false)
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
                        onClick={() => setVoteChoice(item.key)}
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
                    onClick={() => setVoteModalOpen(false)}
                    disabled={voteSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="uiButton uiButtonPrimary"
                    onClick={submitVote}
                    disabled={voteSubmitting || !canVote}
                  >
                    {voteSubmitting ? "Submitting..." : "Submit vote"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
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

  const flagStyle = {
    "--flag-left": `${left}%`,
    "--x-pos": computed
  } as CSSProperties

  return (
    <div
      ref={ref}
      className={styles.progressFlag}
      style={flagStyle}
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

const formatCoinList = (coins: CoinBalance[]) => {
  if (!coins.length) return "--"
  return coins
    .map(
      (coin) =>
        `${formatTokenAmount(coin.amount, 6, 2)} ${formatDenom(coin.denom)}`
    )
    .join(", ")
}

const formatDurationLabel = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--"
  const days = seconds / 86_400
  if (Number.isInteger(days) && days >= 1) return `${days} day${days === 1 ? "" : "s"}`
  const hours = seconds / 3_600
  if (Number.isInteger(hours) && hours >= 1)
    return `${hours} hour${hours === 1 ? "" : "s"}`
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

const sanitizeDecimalInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "")
  const [whole = "", ...fractionParts] = cleaned.split(".")
  const fraction = fractionParts.join("").slice(0, 6)
  return fractionParts.length ? `${whole}.${fraction}` : whole
}

const formatAmountInput = (microAmount: string) => {
  const value = toUnitAmount(microAmount, 6)
  if (!Number.isFinite(value) || value <= 0) return ""
  return value.toFixed(6).replace(/\.?0+$/, "")
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
    const first = value[0]
    if (isSummaryCoin(first)) {
      return value
        .filter(isSummaryCoin)
        .map((coin) =>
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
