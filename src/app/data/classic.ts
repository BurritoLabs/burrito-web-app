import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

export type CoinBalance = {
  denom: string
  amount: string
}

export type ValidatorItem = {
  operator_address: string
  description: { moniker: string }
  commission: { commission_rates: { rate: string } }
}

export type ProposalItem = {
  id: string
  status: string
  title: string
  deposit: string
  submitTime?: string
  votingEndTime?: string
  finalTally?: {
    yes: string
    no: string
    abstain: string
    noWithVeto: string
  }
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

export const fetchDelegations = async (address: string) => {
  const url = buildUrl(
    CLASSIC_CHAIN.lcd,
    `/cosmos/staking/v1beta1/delegations/${address}`,
    { "pagination.limit": "200" }
  )
  const data = await fetchJson<{
    delegation_responses?: Array<{ balance?: CoinBalance }>
  }>(url)
  return data.delegation_responses ?? []
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
  const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/staking/v1beta1/validators", {
    status: "BOND_STATUS_BONDED",
    "pagination.limit": "100"
  })
  const data = await fetchJson<{ validators?: ValidatorItem[] }>(url)
  return data.validators ?? []
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
  if (proposal?.title) return proposal.title as string
  if (proposal?.content?.title) return proposal.content.title as string
  if (proposal?.summary) return proposal.summary as string
  if (proposal?.metadata) {
    try {
      const parsed = JSON.parse(proposal.metadata)
      if (parsed?.title) return parsed.title as string
    } catch {
      return String(proposal.metadata)
    }
  }
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

  return {
    id,
    status,
    title,
    deposit,
    submitTime: proposal?.submit_time ?? proposal?.submit_time?.toString(),
    votingEndTime:
      proposal?.voting_end_time ?? proposal?.voting_end_time?.toString(),
    finalTally
  }
}

const GOV_STATUSES = {
  voting: "PROPOSAL_STATUS_VOTING_PERIOD",
  deposit: "PROPOSAL_STATUS_DEPOSIT_PERIOD",
  passed: "PROPOSAL_STATUS_PASSED",
  rejected: "PROPOSAL_STATUS_REJECTED"
} as const

const mapV1Proposal = (prop: any) => {
  if (Array.isArray(prop?.messages) && prop.messages.length > 0) {
    const message = prop.messages[0]
    const isLegacy =
      message?.["@type"] === "/cosmos.gov.v1.MsgExecLegacyContent"
    const legacyContent = isLegacy ? message.content : null
    const content = legacyContent
      ? legacyContent
      : message
      ? {
          ...message,
          title: prop.title,
          description: prop.summary
        }
      : {
          "@type": "/cosmos.gov.v1.TextProposal",
          title: prop.title,
          description: prop.summary
        }
    return {
      ...prop,
      proposal_id: prop.id,
      content
    }
  }
  return prop
}

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

const fetchGovV1ByStatus = async (status: string) => {
  const proposals = await fetchGovPaged("/cosmos/gov/v1/proposals", {
    proposal_status: status,
    "pagination.limit": "200",
    "pagination.reverse": "true"
  })
  return proposals.map(mapV1Proposal)
}

const fetchGovV1beta1ByStatus = async (status: string) => {
  return fetchGovPaged("/cosmos/gov/v1beta1/proposals", {
    proposal_status: status,
    "pagination.limit": "200",
    "pagination.reverse": "true"
  })
}

export const fetchProposals = async () => {
  const statuses = [
    GOV_STATUSES.voting,
    GOV_STATUSES.deposit,
    GOV_STATUSES.passed,
    GOV_STATUSES.rejected
  ]

  try {
    const pages = await Promise.all(
      statuses.map((status) => fetchGovV1ByStatus(status))
    )
    return pages.flat().map(normalizeProposal)
  } catch {
    const pages = await Promise.all(
      statuses.map((status) => fetchGovV1beta1ByStatus(status))
    )
    return pages.flat().map(normalizeProposal)
  }
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
