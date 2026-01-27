import { CLASSIC_CHAIN } from "../chain"

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

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
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

const normalizeProposal = (proposal: any): ProposalItem => ({
  id: String(proposal?.id ?? proposal?.proposal_id ?? "--"),
  status: String(proposal?.status ?? proposal?.proposal_status ?? "--"),
  title: parseProposalTitle(proposal),
  deposit:
    proposal?.total_deposit?.[0]?.amount ??
    proposal?.total_deposit?.amount ??
    "0",
  submitTime: proposal?.submit_time ?? proposal?.submit_time?.toString(),
  votingEndTime: proposal?.voting_end_time ?? proposal?.voting_end_time?.toString(),
  finalTally: proposal?.final_tally_result
    ? {
        yes: proposal.final_tally_result.yes ?? "0",
        no: proposal.final_tally_result.no ?? "0",
        abstain: proposal.final_tally_result.abstain ?? "0",
        noWithVeto: proposal.final_tally_result.no_with_veto ?? "0"
      }
    : undefined
})

export const fetchProposals = async () => {
  const v1Url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/gov/v1/proposals", {
    "pagination.limit": "50"
  })
  try {
    const data = await fetchJson<{ proposals?: any[] }>(v1Url)
    return (data.proposals ?? []).map(normalizeProposal)
  } catch {
    const legacyUrl = buildUrl(
      CLASSIC_CHAIN.lcd,
      "/cosmos/gov/v1beta1/proposals",
      { "pagination.limit": "50" }
    )
    const data = await fetchJson<{ proposals?: any[] }>(legacyUrl)
    return (data.proposals ?? []).map(normalizeProposal)
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
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=terra-luna,terrausd&vs_currencies=usd&include_24hr_change=true"
  const data = await fetchJson<Record<string, { usd: number; usd_24h_change?: number }>>(
    url
  )
  return {
    lunc: data["terra-luna"],
    ustc: data["terrausd"]
  }
}
