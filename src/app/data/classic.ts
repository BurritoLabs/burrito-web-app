import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

export type CoinBalance = {
  denom: string
  amount: string
}

export type ValidatorItem = {
  operator_address: string
  description: { moniker: string; identity?: string }
  commission: { commission_rates: { rate: string } }
  tokens?: string
  status?: string
}

export type ProposalItem = {
  id: string
  status: string
  title: string
  contentType?: string
  description?: string
  summary?: string
  content?: any
  metadataContent?: any
  metadata?: string
  deposit: string
  submitTime?: string
  votingStartTime?: string
  votingEndTime?: string
  depositEndTime?: string
  finalTally?: {
    yes: string
    no: string
    abstain: string
    noWithVeto: string
  }
}

export type ProposalVote = {
  voter: string
  option: string
  weight?: string
  txhash?: string
}

export type ProposalDeposit = {
  depositor: string
  amount: CoinBalance[]
}

export type GovTally = {
  yes: string
  no: string
  abstain: string
  noWithVeto: string
}

export type GovVotingParams = {
  votingPeriodSeconds: number
}

export type GovDepositParams = {
  minDeposit: CoinBalance[]
  maxDepositPeriodSeconds: number
}

export type GovTallyParams = {
  quorum: number
  threshold: number
  vetoThreshold: number
}

export type StakingPool = {
  bonded_tokens?: { amount: string }
}

export type TxItem = {
  txhash?: string
  timestamp?: string
  code?: number
  tx?: {
    value?: { msg?: Array<{ type?: string }> }
    body?: { messages?: Array<{ "@type"?: string }> }
  }
}

export type PriceMap = {
  lunc?: { usd: number; usd_24h_change?: number }
  ustc?: { usd: number; usd_24h_change?: number }
}

export type SwapRateItem = {
  denom: string
  swaprate: string
}

export type FxRates = {
  MNT?: number
  TWD?: number
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

const PRICE_CACHE_KEY = "burritoPriceCache"
const FX_CACHE_KEY = "burritoFxCache"

export const getCachedPrices = () => {
  if (typeof window === "undefined") return undefined
  const raw = window.localStorage.getItem(PRICE_CACHE_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as { ts?: number; data?: PriceMap }
    if (!parsed?.data) return undefined
    return {
      data: parsed.data,
      ts: parsed.ts ?? Date.now()
    }
  } catch {
    return undefined
  }
}

const setCachedPrices = (data: PriceMap) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      PRICE_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data })
    )
  } catch {
    // ignore
  }
}

export const getCachedFxRates = () => {
  if (typeof window === "undefined") return undefined
  const raw = window.localStorage.getItem(FX_CACHE_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as { ts?: number; data?: FxRates }
    if (!parsed?.data) return undefined
    return {
      data: parsed.data,
      ts: parsed.ts ?? Date.now()
    }
  } catch {
    return undefined
  }
}

const setCachedFxRates = (data: FxRates) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      FX_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data })
    )
  } catch {
    // ignore
  }
}

const buildUrl = (base: string, path: string, params?: Record<string, string>) => {
  const url = new URL(base + path)
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    )
  }
  return url.toString()
}

export const fetchBalances = async (address: string) => {
  const url = buildUrl(CLASSIC_CHAIN.lcd, `/cosmos/bank/v1beta1/balances/${address}`, {
    "pagination.limit": "200"
  })
  const data = await fetchJson<{ balances?: CoinBalance[] }>(url)
  return data.balances ?? []
}

export type DelegationResponse = {
  delegation?: { validator_address?: string }
  balance?: CoinBalance
}

export const fetchDelegations = async (address: string) => {
  const url = buildUrl(
    CLASSIC_CHAIN.lcd,
    `/cosmos/staking/v1beta1/delegations/${address}`,
    { "pagination.limit": "200" }
  )
  const data = await fetchJson<{ delegation_responses?: DelegationResponse[] }>(url)
  return data.delegation_responses ?? []
}

export const fetchDelegationsForVoters = async (addresses: string[]) => {
  const results = new Map<string, DelegationResponse[]>()
  const unique = Array.from(new Set(addresses)).filter(Boolean)
  if (!unique.length) return results
  const batchSize = 6
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (address) => {
        try {
          const list = await fetchDelegations(address)
          return [address, list] as const
        } catch {
          return [address, [] as DelegationResponse[]] as const
        }
      })
    )
    batchResults.forEach(([address, list]) => {
      results.set(address, list)
    })
  }
  return results
}

export const fetchUnbonding = async (address: string) => {
  const url = buildUrl(
    CLASSIC_CHAIN.lcd,
    `/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations`,
    { "pagination.limit": "200" }
  )
  const data = await fetchJson<{
    unbonding_responses?: Array<{ entries?: Array<{ balance?: string }> }>
  }>(url)
  return data.unbonding_responses ?? []
}

export const fetchRewards = async (address: string) => {
  const url = buildUrl(
    CLASSIC_CHAIN.lcd,
    `/cosmos/distribution/v1beta1/delegators/${address}/rewards`
  )
  const data = await fetchJson<{ total?: CoinBalance[] }>(url)
  return data.total ?? []
}

export const fetchValidators = async () => {
  const items: ValidatorItem[] = []
  let nextKey: string | undefined
  let guard = 0

  do {
    const params: Record<string, string> = { "pagination.limit": "200" }
    if (nextKey) params["pagination.key"] = nextKey
    const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/staking/v1beta1/validators", params)
    const data = await fetchJson<{
      validators?: ValidatorItem[]
      pagination?: { next_key?: string | null }
    }>(url)
    items.push(...(data.validators ?? []))
    const newKey = data.pagination?.next_key ?? undefined
    nextKey = newKey && newKey !== nextKey ? newKey : undefined
    guard += 1
  } while (nextKey && guard < 50)

  return items
}

export const fetchValidator = async (operatorAddress: string) => {
  const url = buildUrl(
    CLASSIC_CHAIN.lcd,
    `/cosmos/staking/v1beta1/validators/${operatorAddress}`
  )
  try {
    const data = await fetchJson<{ validator?: ValidatorItem }>(url)
    return data.validator ?? null
  } catch {
    return null
  }
}

const parseProposalTitle = (proposal: any) => {
  const parsedMetadata = proposal?.__metadata ?? tryParseMetadata(proposal?.metadata)
  if (proposal?.title) return proposal.title as string
  if (proposal?.content?.title) return proposal.content.title as string
  if (proposal?.summary) return proposal.summary as string
  if (parsedMetadata?.title) return parsedMetadata.title as string
  if (proposal?.metadata) return String(proposal.metadata)
  return "Proposal"
}

const normalizeProposal = (proposal: any): ProposalItem => {
  const id = String(proposal?.id ?? proposal?.proposal_id ?? "--")
  const status = String(proposal?.status ?? proposal?.proposal_status ?? "--")
  const title = parseProposalTitle(proposal)
  const deposit =
    proposal?.total_deposit?.[0]?.amount ??
    proposal?.total_deposit?.amount ??
    "0"

  const tally = proposal?.final_tally_result
  const finalTally = tally
    ? {
        yes: tally.yes ?? tally.yes_count ?? "0",
        no: tally.no ?? tally.no_count ?? "0",
        abstain: tally.abstain ?? tally.abstain_count ?? "0",
        noWithVeto: tally.no_with_veto ?? tally.no_with_veto_count ?? "0"
      }
    : undefined

  const parsedMetadata = proposal?.__metadata ?? tryParseMetadata(proposal?.metadata)

  const description =
    proposal?.content?.description ??
    proposal?.description ??
    parsedMetadata?.details ??
    parsedMetadata?.description ??
    parsedMetadata?.summary ??
    proposal?.summary ??
    proposal?.content?.summary

  const summary =
    proposal?.summary ??
    proposal?.content?.summary ??
    parsedMetadata?.summary ??
    parsedMetadata?.details ??
    parsedMetadata?.description

  return {
    id,
    status,
    title,
    contentType:
      proposal?.content?.["@type"] ??
      proposal?.content?.type ??
      proposal?.messages?.[0]?.["@type"] ??
      proposal?.messages?.[0]?.type ??
      undefined,
    description,
    summary,
    content: proposal?.content ?? proposal?.content?.content ?? proposal?.messages?.[0],
    metadataContent: parsedMetadata,
    metadata: proposal?.metadata,
    deposit,
    submitTime: proposal?.submit_time ?? proposal?.submit_time?.toString(),
    votingStartTime:
      proposal?.voting_start_time ?? proposal?.voting_start_time?.toString(),
    votingEndTime:
      proposal?.voting_end_time ?? proposal?.voting_end_time?.toString(),
    depositEndTime:
      proposal?.deposit_end_time ?? proposal?.deposit_end_time?.toString(),
    finalTally
  }
}

const tryParseMetadata = (metadata?: string) => {
  if (!metadata) return undefined
  try {
    return JSON.parse(metadata)
  } catch {
    return undefined
  }
}

const resolveMetadata = async (metadata?: string) => {
  if (!metadata) return undefined
  const parsed = tryParseMetadata(metadata)
  if (parsed) return parsed
  const trimmed = metadata.trim()
  const gateways = [
    "https://cloudflare-ipfs.com/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/"
  ]
  const isHttp = trimmed.startsWith("http://") || trimmed.startsWith("https://")
  const isIpfs = trimmed.startsWith("ipfs://")
  const isCid = /^[a-z0-9]{46,}$/i.test(trimmed)

  const urls: string[] = []
  if (isIpfs) {
    const hash = trimmed.replace("ipfs://", "")
    gateways.forEach((base) => urls.push(`${base}${hash}`))
  } else if (isHttp) {
    urls.push(trimmed)
  } else if (isCid) {
    gateways.forEach((base) => urls.push(`${base}${trimmed}`))
  }

  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      return await response.json()
    } catch {
      continue
    }
  }
  return undefined
}

const GOV_STATUSES = {
  voting: "PROPOSAL_STATUS_VOTING_PERIOD",
  deposit: "PROPOSAL_STATUS_DEPOSIT_PERIOD",
  passed: "PROPOSAL_STATUS_PASSED",
  rejected: "PROPOSAL_STATUS_REJECTED"
} as const

const fetchGovPaged = async (path: string, params: Record<string, string>) => {
  const items: any[] = []
  let nextKey: string | undefined
  let guard = 0

  do {
    const pageParams = {
      ...params,
      ...(nextKey ? { "pagination.key": nextKey } : {})
    }
    const url = buildUrl(CLASSIC_CHAIN.lcd, path, pageParams)
    const data = await fetchJson<{
      proposals?: any[]
      pagination?: { next_key?: string | null }
    }>(url)
    items.push(...(data.proposals ?? []))
    const newKey = data.pagination?.next_key ?? undefined
    nextKey = newKey && newKey !== nextKey ? newKey : undefined
    guard += 1
  } while (nextKey && guard < 50)

  return items
}

const fetchGovV1beta1ByStatus = async (status: string) => {
  return fetchGovPaged("/cosmos/gov/v1beta1/proposals", {
    proposal_status: status,
    "pagination.limit": "200",
    "pagination.reverse": "true"
  })
}

const fetchGovV1ByStatus = async (status: string) => {
  return fetchGovPaged("/cosmos/gov/v1/proposals", {
    proposal_status: status,
    "pagination.limit": "200",
    "pagination.reverse": "true"
  })
}

const fetchProposalVotesFromTxs = async (
  id: string,
  events: string
): Promise<ProposalVote[]> => {
  const votes = new Map<
    string,
    { option: string; weight?: string; height: number; txhash?: string }
  >()
  let page = 1
  const limit = 100
  let total = Number.POSITIVE_INFINITY
  let guard = 0
  const maxPages = 200

  const parseOptionValue = (raw?: string) => {
    if (!raw) return { option: undefined as string | undefined, weight: undefined as string | undefined }
    if (raw.includes("option:")) {
      const optionMatch = raw.match(/option:([A-Z0-9_]+)/)
      const weightMatch = raw.match(/weight:\"([0-9.]+)\"/)
      return {
        option: optionMatch?.[1],
        weight: weightMatch?.[1]
      }
    }
    return { option: raw, weight: undefined }
  }

  while ((page - 1) * limit < total && guard < maxPages) {
    const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/tx/v1beta1/txs", {
      events,
      page: String(page),
      limit: String(limit),
      "pagination.count_total": "true"
    })
    const data = await fetchJson<{
      txs?: Array<{ body?: { messages?: any[] } }>
      tx_responses?: Array<{
        height?: string
        txhash?: string
        events?: Array<{
          type?: string
          attributes?: Array<{ key?: string; value?: string }>
        }>
      }>
      total?: string
    }>(url)

    const batch = data.txs ?? []
    const responses = data.tx_responses ?? []
    const parsedTotal = Number(data.total ?? NaN)
    if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
      total = parsedTotal
    }

    if (!batch.length && !responses.length) break

    const length = Math.max(batch.length, responses.length)
    for (let index = 0; index < length; index += 1) {
      const height = Number(responses[index]?.height ?? 0)
      const txhash = responses[index]?.txhash ?? undefined
      const events = responses[index]?.events ?? []

      const eventVotes: Array<{
        voter: string
        option?: string
        weight?: string
        txhash?: string
      }> = []
      events.forEach((event) => {
        if (event?.type !== "proposal_vote") return
        const attrs = event.attributes ?? []
        const getAttr = (key: string) =>
          attrs.find((attr) => attr.key === key)?.value
        const proposalId = getAttr("proposal_id")
        if (String(proposalId ?? "") !== String(id)) return
        const voter = getAttr("voter")
        const rawOption = getAttr("option")
        const parsed = parseOptionValue(rawOption)
        if (!voter || !parsed.option) return
        eventVotes.push({
          voter,
          option: parsed.option,
          weight: parsed.weight,
          txhash
        })
      })

      if (!eventVotes.length) {
        const messages = batch[index]?.body?.messages ?? []
        messages.forEach((message) => {
          const type = message?.["@type"] ?? ""
          if (
            type !== "/cosmos.gov.v1.MsgVote" &&
            type !== "/cosmos.gov.v1.MsgVoteWeighted" &&
            type !== "/cosmos.gov.v1beta1.MsgVote" &&
            type !== "/cosmos.gov.v1beta1.MsgVoteWeighted"
          ) {
            return
          }
          if (String(message?.proposal_id ?? "") !== String(id)) return
          const voter = message?.voter
          if (!voter) return

          let option = message?.option
          let weight = message?.weight
          if (Array.isArray(message?.options) && message.options.length) {
            const sorted = [...message.options].sort(
              (a, b) => Number(b?.weight ?? 0) - Number(a?.weight ?? 0)
            )
            option = sorted[0]?.option ?? option
            weight = sorted[0]?.weight ?? weight
          }
          if (!option) return

          eventVotes.push({ voter, option, weight, txhash })
        })
      }

      eventVotes.forEach(({ voter, option, weight, txhash }) => {
        if (!option) return
        const current = votes.get(voter)
        if (!current || height >= current.height) {
          votes.set(voter, {
            option,
            weight,
            height,
            txhash
          })
        }
      })
    }

    if (batch.length < limit) break
    page += 1
    guard += 1
  }

  return Array.from(votes.entries()).map(([voter, payload]) => ({
    voter,
    option: payload.option,
    weight: payload.weight,
    txhash: payload.txhash
  }))
}

export const fetchProposals = async () => {
  const statuses = [
    GOV_STATUSES.voting,
    GOV_STATUSES.deposit,
    GOV_STATUSES.passed,
    GOV_STATUSES.rejected
  ]

  const pages = await Promise.all(
    statuses.map(async (status) => {
      try {
        return await fetchGovV1ByStatus(status)
      } catch {
        try {
          return await fetchGovV1beta1ByStatus(status)
        } catch {
          return []
        }
      }
    })
  )
  return pages.flat().map(normalizeProposal)
}

const parseDurationSeconds = (value?: string | number) => {
  if (!value) return 0
  if (typeof value === "number") return value
  const trimmed = String(value).trim()
  if (!trimmed) return 0
  if (trimmed.endsWith("s")) {
    const num = Number(trimmed.replace("s", ""))
    return Number.isFinite(num) ? num : 0
  }
  const raw = Number(trimmed)
  if (!Number.isFinite(raw)) return 0
  if (raw > 1e12) return Math.round(raw / 1e9)
  return raw
}

const normalizeTally = (tally: any): GovTally => ({
  yes: tally?.yes ?? tally?.yes_count ?? "0",
  no: tally?.no ?? tally?.no_count ?? "0",
  abstain: tally?.abstain ?? tally?.abstain_count ?? "0",
  noWithVeto: tally?.no_with_veto ?? tally?.no_with_veto_count ?? "0"
})

export const fetchProposalById = async (id: string) => {
  try {
    const data = await fetchJson<{ proposal?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, `/cosmos/gov/v1/proposals/${id}`)
    )
    const proposal = data?.proposal ?? {}
    const resolved = await resolveMetadata(proposal?.metadata)
    if (resolved) {
      proposal.__metadata = resolved
    }
    return normalizeProposal(proposal)
  } catch {
    const data = await fetchJson<{ proposal?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, `/cosmos/gov/v1beta1/proposals/${id}`)
    )
    const proposal = data?.proposal ?? {}
    const resolved = await resolveMetadata(proposal?.metadata)
    if (resolved) {
      proposal.__metadata = resolved
    }
    return normalizeProposal(proposal)
  }
}

export const fetchProposalTally = async (id: string): Promise<GovTally> => {
  try {
    const data = await fetchJson<{ tally?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, `/cosmos/gov/v1/proposals/${id}/tally`)
    )
    return normalizeTally(data?.tally)
  } catch {
    const data = await fetchJson<{ tally?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, `/cosmos/gov/v1beta1/proposals/${id}/tally`)
    )
    return normalizeTally(data?.tally)
  }
}

const fetchGovPagedList = async (path: string, params: Record<string, string>) => {
  const items: any[] = []
  let nextKey: string | undefined
  let guard = 0

  do {
    const pageParams = {
      ...params,
      ...(nextKey ? { "pagination.key": nextKey } : {})
    }
    const url = buildUrl(CLASSIC_CHAIN.lcd, path, pageParams)
    const data = await fetchJson<{
      votes?: any[]
      deposits?: any[]
      pagination?: { next_key?: string | null }
    }>(url)
    items.push(...(data.votes ?? data.deposits ?? []))
    const newKey = data.pagination?.next_key ?? undefined
    nextKey = newKey && newKey !== nextKey ? newKey : undefined
    guard += 1
  } while (nextKey && guard < 50)

  return items
}

export const fetchProposalVotes = async (
  id: string,
  status?: string
): Promise<ProposalVote[]> => {
  let votes: any[] = []
  try {
    votes = await fetchGovPagedList(
      `/cosmos/gov/v1/proposals/${id}/votes`,
      { "pagination.limit": "200" }
    )
  } catch {
    votes = await fetchGovPagedList(
      `/cosmos/gov/v1beta1/proposals/${id}/votes`,
      { "pagination.limit": "200" }
    )
  }
  const normalized = votes.map((vote) => {
    let option = vote?.option ?? "--"
    let weight = vote?.weight ?? undefined
    if (Array.isArray(vote?.options) && vote.options.length) {
      const sorted = [...vote.options].sort((a, b) =>
        Number(b?.weight ?? 0) - Number(a?.weight ?? 0)
      )
      option = sorted[0]?.option ?? option
      weight = sorted[0]?.weight ?? weight
    }
    return {
      voter: vote?.voter ?? vote?.voter_address ?? "--",
      option,
      weight
    }
  })
  const shouldUseTxs =
    status !== undefined && status !== null && status !== GOV_STATUSES.voting
  if (!shouldUseTxs && normalized.length) return normalized
  let txVotes = await fetchProposalVotesFromTxs(
    id,
    `proposal_vote.proposal_id='${id}'`
  )
  if (!txVotes.length) {
    const actionEvents = [
      "/cosmos.gov.v1beta1.MsgVote",
      "/cosmos.gov.v1beta1.MsgVoteWeighted",
      "/cosmos.gov.v1.MsgVote",
      "/cosmos.gov.v1.MsgVoteWeighted"
    ]
    const fallbackMap = new Map<string, ProposalVote>()
    for (const action of actionEvents) {
      const actionVotes = await fetchProposalVotesFromTxs(
        id,
        `message.action='${action}'`
      )
      actionVotes.forEach((vote) => {
        fallbackMap.set(vote.voter, vote)
      })
    }
    if (fallbackMap.size) {
      txVotes = Array.from(fallbackMap.values())
    }
  }
  if (!normalized.length) return txVotes
  if (!txVotes.length) return normalized
  const merged = new Map<string, ProposalVote>()
  normalized.forEach((vote) => merged.set(vote.voter, vote))
  txVotes.forEach((vote) => {
    const current = merged.get(vote.voter)
    if (!current) {
      merged.set(vote.voter, vote)
      return
    }
    merged.set(vote.voter, {
      ...current,
      ...vote,
      txhash: vote.txhash ?? current.txhash
    })
  })
  return Array.from(merged.values())
}

export const fetchProposalVoteTxHashes = async (
  id: string,
  voters: string[]
): Promise<Record<string, string>> => {
  const target = new Set(voters.filter(Boolean))
  if (!target.size) return {}
  const found = new Map<string, { txhash: string; height: number }>()
  let page = 1
  const limit = 100
  let total = Number.POSITIVE_INFINITY
  let guard = 0
  const maxPages = 200

  while ((page - 1) * limit < total && guard < maxPages && found.size < target.size) {
    const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/tx/v1beta1/txs", {
      events: `proposal_vote.proposal_id='${id}'`,
      page: String(page),
      limit: String(limit),
      "pagination.count_total": "true"
    })
    const data = await fetchJson<{
      tx_responses?: Array<{
        height?: string
        txhash?: string
        events?: Array<{
          type?: string
          attributes?: Array<{ key?: string; value?: string }>
        }>
      }>
      total?: string
    }>(url)

    const responses = data.tx_responses ?? []
    const parsedTotal = Number(data.total ?? NaN)
    if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
      total = parsedTotal
    }
    if (!responses.length) break

    responses.forEach((response) => {
      const height = Number(response?.height ?? 0)
      const txhash = response?.txhash
      if (!txhash) return
      const events = response?.events ?? []
      events.forEach((event) => {
        if (event?.type !== "proposal_vote") return
        const attrs = event.attributes ?? []
        const getAttr = (key: string) =>
          attrs.find((attr) => attr.key === key)?.value
        const proposalId = getAttr("proposal_id")
        if (String(proposalId ?? "") !== String(id)) return
        const voter = getAttr("voter")
        if (!voter || !target.has(voter)) return
        const current = found.get(voter)
        if (!current || height >= current.height) {
          found.set(voter, { txhash, height })
        }
      })
    })

    if (responses.length < limit) break
    page += 1
    guard += 1
  }

  return Object.fromEntries(Array.from(found.entries()).map(([voter, meta]) => [voter, meta.txhash]))
}

export const fetchProposalDeposits = async (
  id: string
): Promise<ProposalDeposit[]> => {
  let deposits: any[] = []
  try {
    deposits = await fetchGovPagedList(
      `/cosmos/gov/v1/proposals/${id}/deposits`,
      { "pagination.limit": "200" }
    )
  } catch {
    deposits = await fetchGovPagedList(
      `/cosmos/gov/v1beta1/proposals/${id}/deposits`,
      { "pagination.limit": "200" }
    )
  }
  return deposits.map((deposit) => ({
    depositor: deposit?.depositor ?? "--",
    amount: deposit?.amount ?? []
  }))
}

export const fetchVotingParams = async (): Promise<GovVotingParams> => {
  try {
    const data = await fetchJson<{ voting_params?: any; params?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1/params/voting")
    )
    const seconds = parseDurationSeconds(
      data?.voting_params?.voting_period ?? data?.params?.voting_period
    )
    return { votingPeriodSeconds: seconds }
  } catch {
    const data = await fetchJson<{ voting_params?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1beta1/params/voting")
    )
    const seconds = parseDurationSeconds(data?.voting_params?.voting_period)
    return { votingPeriodSeconds: seconds }
  }
}

export const fetchDepositParams = async (): Promise<GovDepositParams> => {
  try {
    const data = await fetchJson<{ deposit_params?: any; params?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1/params/deposit")
    )
    return {
      minDeposit:
        data?.deposit_params?.min_deposit ?? data?.params?.min_deposit ?? [],
      maxDepositPeriodSeconds: parseDurationSeconds(
        data?.deposit_params?.max_deposit_period ??
          data?.params?.max_deposit_period
      )
    }
  } catch {
    const data = await fetchJson<{ deposit_params?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1beta1/params/deposit")
    )
    return {
      minDeposit: data?.deposit_params?.min_deposit ?? [],
      maxDepositPeriodSeconds: parseDurationSeconds(
        data?.deposit_params?.max_deposit_period
      )
    }
  }
}

export const fetchTallyParams = async (): Promise<GovTallyParams> => {
  try {
    const data = await fetchJson<{ tally_params?: any; params?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1/params/tallying")
    )
    return {
      quorum: Number(
        data?.tally_params?.quorum ?? data?.params?.quorum ?? 0
      ),
      threshold: Number(
        data?.tally_params?.threshold ?? data?.params?.threshold ?? 0
      ),
      vetoThreshold: Number(
        data?.tally_params?.veto_threshold ?? data?.params?.veto_threshold ?? 0
      )
    }
  } catch {
    const data = await fetchJson<{ tally_params?: any }>(
      buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1beta1/params/tallying")
    )
    return {
      quorum: Number(data?.tally_params?.quorum ?? 0),
      threshold: Number(data?.tally_params?.threshold ?? 0),
      vetoThreshold: Number(data?.tally_params?.veto_threshold ?? 0)
    }
  }
}

export const fetchStakingPool = async (): Promise<StakingPool> => {
  const data = await fetchJson<{ pool?: StakingPool }>(
    buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/staking/v1beta1/pool")
  )
  const pool = data?.pool ?? {}
  const bonded = (pool as any)?.bonded_tokens
  if (typeof bonded === "string") {
    return { bonded_tokens: { amount: bonded } }
  }
  if (bonded && typeof bonded === "object" && "amount" in bonded) {
    return { bonded_tokens: { amount: (bonded as any).amount ?? "0" } }
  }
  return {}
}

export const fetchTxs = async (address: string, limit = 10) => {
  const url = buildUrl(CLASSIC_CHAIN.fcd, "/v1/txs", {
    account: address,
    limit: String(limit),
    offset: "0"
  })
  const data = await fetchJson<{ txs?: TxItem[] }>(url)
  return data.txs ?? []
}

export const fetchContractInfo = async (address: string) => {
  const url = buildUrl(
    CLASSIC_CHAIN.lcd,
    `/cosmwasm/wasm/v1/contract/${address}`
  )
  const data = await fetchJson<{ contract_info?: any }>(url)
  return data.contract_info ?? null
}

export const fetchPrices = async (): Promise<PriceMap> => {
  const base =
    import.meta.env.DEV ? "/coingecko" : "https://api.coingecko.com/api/v3"
  const url = `${base}/simple/price?ids=terra-luna,terraclassicusd,terrausd&vs_currencies=usd&include_24hr_change=true`
  const cached = getCachedPrices()
  try {
    const data = await fetchJson<
      Record<string, { usd: number; usd_24h_change?: number }>
    >(url)
    const result: PriceMap = {
      lunc: data["terra-luna"] ?? cached?.data?.lunc,
      ustc:
        data["terraclassicusd"] ??
        data["terrausd"] ??
        cached?.data?.ustc
    }
    if (!result.ustc) {
      try {
        const paprika = await fetchJson<{
          quotes?: { USD?: { price?: number; percent_change_24h?: number } }
        }>("https://api.coinpaprika.com/v1/tickers/ust-terrausd")
        const price = paprika?.quotes?.USD?.price
        if (price) {
          result.ustc = {
            usd: price,
            usd_24h_change: paprika?.quotes?.USD?.percent_change_24h
          }
        }
      } catch {
        // ignore fallback failure
      }
    }
    if (result.lunc || result.ustc) {
      setCachedPrices(result)
    }
    return result
  } catch (err) {
    if (cached?.data) {
      return cached.data
    }
    throw err
  }
}

export const fetchFxRates = async (): Promise<FxRates> => {
  const cached = getCachedFxRates()
  try {
    const data = await fetchJson<{ rates?: Record<string, number> }>(
      "https://open.er-api.com/v6/latest/USD"
    )
    const rates = data?.rates ?? {}
    const result: FxRates = {
      MNT: rates.MNT ? 1 / rates.MNT : undefined,
      TWD: rates.TWD ? 1 / rates.TWD : undefined
    }
    if (result.MNT || result.TWD) {
      setCachedFxRates(result)
    }
    return result
  } catch (err) {
    if (cached?.data) {
      return cached.data
    }
    throw err
  }
}

export const fetchSwapRates = async (
  currency = CLASSIC_DENOMS.ustc.coinMinimalDenom
) => {
  const url = buildUrl(CLASSIC_CHAIN.fcd, `/v1/market/swaprate/${currency}`)
  const data = await fetchJson<SwapRateItem[]>(url)
  return data ?? []
}
