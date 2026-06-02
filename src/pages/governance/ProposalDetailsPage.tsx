import {
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"
import { useLocation, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MsgDeposit, MsgVote } from "cosmjs-types/cosmos/gov/v1beta1/tx"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import PageShell from "../PageShell"
import styles from "../ProposalDetails.module.css"
import ProposalDepositModal from "./ProposalDepositModal"
import ProposalDepositSection from "./ProposalDepositSection"
import ProposalDetailIntro from "./ProposalDetailIntro"
import ProposalPrimaryAction from "./ProposalPrimaryAction"
import ProposalTallyProcedure from "./ProposalTallyProcedure"
import ProposalVoteModal from "./ProposalVoteModal"
import ProposalVotesPanel from "./ProposalVotesPanel"
import { renderProposalSummaryValue } from "./ProposalSummaryValue"
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
} from "../../app/data/classic"
import {
  toUnitAmount,
  formatTokenAmount
} from "../../app/utils/format"
import { formatTxError } from "../../app/utils/txError"
import { convertBech32Prefix } from "../../app/utils/bech32"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../../app/chain"
import { KEYBASE_PROXY_URL } from "../../app/config/externalServices"
import {
  VOTE_OPTION_VALUES,
  capitalize,
  formatCoinList,
  formatDenom,
  formatDurationLabel,
  isSummaryMap,
  normalizeRenderedVoteOption,
  parseSequenceMismatchExpected,
  toMicroAmount,
  toSafeBigInt,
  type SummaryMap,
  type VoteChoice
} from "../../app/governance/proposalFormat"
import { useWallet } from "../../app/wallet/WalletContext"
import {
  connectClassicStargateClientForConnector,
  getSignerAddressForConnector,
  type ClassicStargateClient
} from "../../app/wallet/walletAdapters"
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
} from "../../app/data/classic"

const GAS_PRICE_MICRO = 28.325
const VOTE_GAS_LIMIT = 220000
const DEPOSIT_GAS_LIMIT = 220000
const GOV_GAS_ADJUSTMENT = 1.6
const SIMULATION_FALLBACK_GAS_MULTIPLIER = 1.35
const GOV_BROADCAST_TIMEOUT_MS = 60_000
const GOV_BROADCAST_POLL_INTERVAL_MS = 2_000
const buildGovFee = (gasLimit: number) => ({
  amount: [
    {
      amount: Math.max(1, Math.ceil(gasLimit * GAS_PRICE_MICRO)).toString(),
      denom: CLASSIC_DENOMS.lunc.coinMinimalDenom
    }
  ],
  gas: String(gasLimit)
})

const estimateGovFee = async (
  client: ClassicStargateClient,
  signerAddress: string,
  messages: Parameters<ClassicStargateClient["simulate"]>[1],
  fallbackGas: number
) => {
  let gasLimit = fallbackGas
  try {
    const simulatedGas = await client.simulate(signerAddress, messages, "")
    gasLimit = Math.max(
      fallbackGas,
      Math.ceil(simulatedGas * GOV_GAS_ADJUSTMENT)
    )
  } catch {
    gasLimit = Math.ceil(fallbackGas * SIMULATION_FALLBACK_GAS_MULTIPLIER)
  }

  return buildGovFee(gasLimit)
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
    refetchIntervalInBackground: false
  })

  const { data: tally } = useQuery<GovTally>({
    queryKey: ["proposalTally", proposalId],
    queryFn: () => fetchProposalTally(proposalId),
    enabled: Boolean(proposalId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false
  })

  const { data: votes = [] } = useQuery<ProposalVote[]>({
    queryKey: ["proposalVotes", proposalId, proposal?.status],
    queryFn: () => fetchProposalVotes(proposalId, proposal?.status),
    enabled: Boolean(proposalId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false
  })

  const { data: deposits = [] } = useQuery<ProposalDeposit[]>({
    queryKey: ["proposalDeposits", proposalId],
    queryFn: () => fetchProposalDeposits(proposalId),
    enabled: Boolean(proposalId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false
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
            value: renderProposalSummaryValue(key, value)
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
    return normalizeRenderedVoteOption(value)
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
      const signerAddress = await getSignerAddressForConnector(connectorId)
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
          voter: signerAddress,
          option: VOTE_OPTION_VALUES[voteChoice]
        })
      }

      let sequenceHint: number | undefined
      let result: string | undefined

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const client = await connectClassicStargateClientForConnector(
            connectorId
          )
          const fee = await estimateGovFee(
            client,
            signerAddress,
            [msg],
            VOTE_GAS_LIMIT
          )
          const signerState = await client.getSequence(signerAddress)
          const sequenceToUse = sequenceHint ?? signerState.sequence

          const signed = await client.sign(
            signerAddress,
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
          const broadcastResult = await client.broadcastTx(
            txBytes,
            GOV_BROADCAST_TIMEOUT_MS,
            GOV_BROADCAST_POLL_INTERVAL_MS
          )
          if (broadcastResult.code !== 0) {
            throw new Error(
              broadcastResult.rawLog ||
                `Vote transaction failed with code ${broadcastResult.code}`
            )
          }
          if (!broadcastResult.transactionHash) {
            throw new Error("Vote transaction failed")
          }
          result = broadcastResult.transactionHash
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
      const message = formatTxError(err, "Vote failed")
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
      const signerAddress = await getSignerAddressForConnector(connectorId)

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
          depositor: signerAddress,
          amount: [
            {
              denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
              amount: depositAmountMicro.toString()
            }
          ]
        })
      }

      let sequenceHint: number | undefined
      let result: string | undefined

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const client = await connectClassicStargateClientForConnector(
            connectorId
          )
          const fee = await estimateGovFee(
            client,
            signerAddress,
            [msg],
            DEPOSIT_GAS_LIMIT
          )
          const signerState = await client.getSequence(signerAddress)
          const sequenceToUse = sequenceHint ?? signerState.sequence

          const signed = await client.sign(
            signerAddress,
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
          const broadcastResult = await client.broadcastTx(
            txBytes,
            GOV_BROADCAST_TIMEOUT_MS,
            GOV_BROADCAST_POLL_INTERVAL_MS
          )
          if (broadcastResult.code !== 0) {
            throw new Error(
              broadcastResult.rawLog ||
                `Deposit transaction failed with code ${broadcastResult.code}`
            )
          }
          if (!broadcastResult.transactionHash) {
            throw new Error("Deposit transaction failed")
          }
          result = broadcastResult.transactionHash
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
      const message = formatTxError(err, "Deposit failed")
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
        <ProposalPrimaryAction
          actionDisabled={actionDisabled}
          actionLabel={actionLabel}
          isDepositPeriod={isDepositPeriod}
          isVotingPeriod={isVotingPeriod}
          onOpenDeposit={() => setDepositModalOpen(true)}
          onOpenVote={() => setVoteModalOpen(true)}
        />
      }
    >
      <ProposalDetailIntro
        authors={authors}
        forumLabel={forumLabel}
        forumUrl={forumUrl}
        parsedDescription={parsedDescription}
        proposal={proposal}
        proposalTypeLabel={formatProposalType(proposal?.contentType)}
        showDetails={showDetails}
        statusClass={statusClass}
        statusLabel={statusLabel}
        summaryItems={summaryItems}
        voteContext={voteContext}
        onToggleDetails={() => setShowDetails((prev) => !prev)}
      />

      {statusLabel === "Deposit" ? (
        <ProposalDepositSection
          accountAddress={account?.address}
          canDeposit={canDeposit}
          depositProgressPercent={depositProgressPercent}
          deposits={deposits}
          luncBalanceLabel={luncBalanceLabel}
          proposalDepositEndTime={proposal?.depositEndTime}
          stats={depositStats}
          onOpenDeposit={() => setDepositModalOpen(true)}
        />
      ) : null}

      <ProposalVotesPanel
        filteredVotesCount={filteredVotesByValidator.length}
        keybasePictures={keybasePictures}
        proposalVotingEndTime={proposal?.votingEndTime}
        tallyStats={tallyStats}
        totalVoteWeight={totalVoteWeight}
        visibleVotes={visibleVotes}
        visibleVotesByValidator={visibleVotesByValidator}
        voteFilter={voteFilter}
        voteRows={voteRows}
        voteTxHashes={voteTxHashes}
        onChangeVoteFilter={setVoteFilter}
        onLoadMoreVotes={() => setVisibleVotes((prev) => prev + 25)}
      />

      <ProposalTallyProcedure tallyParams={tallyParams} />

      {depositModalOpen ? (
        <ProposalDepositModal
          depositAmount={depositAmount}
          depositAmountMicro={depositAmountMicro}
          depositAmountValue={depositAmountValue}
          depositError={depositError}
          depositSubmitting={depositSubmitting}
          depositValidationMessage={depositValidationMessage}
          luncBalance={luncBalance}
          luncBalanceLabel={luncBalanceLabel}
          proposalDepositEndTime={proposal?.depositEndTime}
          stats={depositStats}
          onClose={() => setDepositModalOpen(false)}
          onSubmit={submitDeposit}
          onUpdateAmount={setDepositAmount}
        />
      ) : null}

      {voteModalOpen ? (
        <ProposalVoteModal
          canVote={canVote}
          voteChoice={voteChoice}
          voteError={voteError}
          voteSubmitting={voteSubmitting}
          onChangeVoteChoice={setVoteChoice}
          onClose={() => setVoteModalOpen(false)}
          onSubmit={submitVote}
        />
      ) : null}
    </PageShell>
  )
}

export default ProposalDetails
