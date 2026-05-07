const BINODES_BASE = "https://api.binodes.com"

type BinodesResponse<T> = {
  code?: number
  message?: string
  data?: T[]
  meta?: {
    timestamp?: string
    count?: number
    powered_by?: string
  }
}

export type BinodesNetworkOverview = {
  dt?: string
  block_cnt?: number
  tx_total_cnt?: number
  gas_used?: number
  gas_wanted?: number
  active_addr_cnt?: number
  new_addr_cnt?: number
  ibc_tx_cnt?: number
  ibc_volume_usd?: number
  net_ibc_flow_usd?: number
  dex_tx_cnt?: number
  dex_volume_usd?: number
  transfer_cnt?: number
  transfer_amt_usd?: number
}

export type BinodesDexOverview = {
  dt?: string
  dex_volume_usd?: number
  dex_tx_cnt?: number
  dex_swap_in_usd?: number
  dex_swap_out_usd?: number
  dex_spread_loss_usd?: number
  dex_commission_paid_usd?: number
  dex_liquidity_add_usd?: number
  dex_liquidity_remove_usd?: number
}

export type BinodesBurnOverview = {
  dt?: string
  fee_burn_usd?: number
  voluntary_burn_cnt?: number
  voluntary_burn_usd?: number
}

export type BinodesIbcOverview = {
  dt?: string
  ibc_tx_in_cnt?: number
  ibc_volume_in_usd?: number
  ibc_tx_out_cnt?: number
  ibc_volume_out_usd?: number
  ibc_tx_cnt?: number
  ibc_volume_usd?: number
  net_ibc_flow_usd?: number
}

export type BinodesStakeOverview = {
  dt?: string
  staking_delegate_cnt?: number
  staking_delegate_actual?: number
  staking_delegate_usd?: number
  staking_undelegate_cnt?: number
  staking_undelegate_actual?: number
  staking_undelegate_usd?: number
  staking_redelegate_cnt?: number
  staking_redelegate_actual?: number
  staking_redelegate_usd?: number
}

export type BinodesFeesOverview = {
  dt?: string
  gas_wanted?: number
  gas_used?: number
  fee_gas_usd?: number
  fee_cp_usd?: number
  fee_op_usd?: number
}

export type BinodesGovernanceOverview = {
  dt?: string
  gov_deposit_cnt?: number
  gov_deposit_actual?: number
  gov_deposit_usd?: number
  gov_proposal_submit_cnt?: number
  gov_vote_cnt?: number
  gov_vote_yes_cnt?: number
  gov_vote_no_cnt?: number
  gov_vote_veto_cnt?: number
  gov_vote_abstain_cnt?: number
}

export type BinodesDashboardActivity = {
  fetchedAt: string
  network?: BinodesNetworkOverview
  dex?: BinodesDexOverview
  burns?: BinodesBurnOverview
  ibc?: BinodesIbcOverview
  stake?: BinodesStakeOverview
  fees?: BinodesFeesOverview
  governance?: BinodesGovernanceOverview
}

const buildBinodesUrl = (path: string, params?: Record<string, string>) => {
  const url = new URL(path, BINODES_BASE)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return url.toString()
}

const fetchBinodesList = async <T>(
  path: string,
  params: Record<string, string> = {}
) => {
  const response = await fetch(
    buildBinodesUrl(path, {
      limit: "1",
      ...params
    })
  )
  if (!response.ok) {
    throw new Error(`BiNodes request failed: ${response.status}`)
  }
  const payload = (await response.json()) as BinodesResponse<T>
  if (payload.code !== undefined && payload.code !== 200) {
    throw new Error(payload.message || "BiNodes request failed")
  }
  return payload.data ?? []
}

const firstOrUndefined = <T>(items: T[]) => items[0]

const settleFirst = async <T>(
  path: string,
  params?: Record<string, string>
) => {
  try {
    return firstOrUndefined(await fetchBinodesList<T>(path, params))
  } catch {
    return undefined
  }
}

export const fetchBinodesDashboardActivity =
  async (): Promise<BinodesDashboardActivity> => {
    const [
      network,
      dex,
      burns,
      ibc,
      stake,
      fees,
      governance
    ] = await Promise.all([
      settleFirst<BinodesNetworkOverview>("/v1/network/overview"),
      settleFirst<BinodesDexOverview>("/v1/dex/overview"),
      settleFirst<BinodesBurnOverview>("/v1/burns/overview"),
      settleFirst<BinodesIbcOverview>("/v1/ibc/overview"),
      settleFirst<BinodesStakeOverview>("/v1/stake/overview"),
      settleFirst<BinodesFeesOverview>("/v1/fees/overview"),
      settleFirst<BinodesGovernanceOverview>("/v1/governance/overview")
    ])

    return {
      fetchedAt: new Date().toISOString(),
      network,
      dex,
      burns,
      ibc,
      stake,
      fees,
      governance
    }
  }
