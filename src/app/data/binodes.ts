const BINODES_BASE = "https://api.binodes.com"
const BINODES_REQUEST_TIMEOUT_MS = 3_500

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
  fee_gas_usd?: number
  fee_cp_usd?: number
  fee_op_usd?: number
  fee_burn_usd?: number
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

export type BinodesBurnAssetOverview = {
  dt?: string
  denom?: string
  symbol?: string
  fee_burn_amt_actual?: number
  fee_burn_amt_usd?: number
  voluntary_burn_cnt?: number
  voluntary_burn_amt_actual?: number
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

export type BinodesDashboardFrequency = "HOUR" | "DAY" | "WEEK"

export type BinodesDashboardActivity = {
  fetchedAt: string
  bucketCount: number
  frequency: BinodesDashboardFrequency
  series: BinodesDashboardSeriesPoint[]
  network?: BinodesNetworkOverview
  dex?: BinodesDexOverview
  burns?: BinodesBurnOverview
  ibc?: BinodesIbcOverview
  stake?: BinodesStakeOverview
  fees?: BinodesFeesOverview
  governance?: BinodesGovernanceOverview
  luncBurns?: BinodesBurnAssetOverview
  ustcBurns?: BinodesBurnAssetOverview
}

export type BinodesDashboardSeriesPoint = {
  dt: string
  txTotalCnt?: number
  transferAmountUsd?: number
  activeAddressCount?: number
  feeGasUsd?: number
  feeCpUsd?: number
  feeOpUsd?: number
  feeBurnUsd?: number
  voluntaryBurnUsd?: number
  totalFeeUsd?: number
  burnUsd?: number
  stakingDelegateUsd?: number
  stakingUndelegateUsd?: number
  luncBurnAmount?: number
  luncBurnUsd?: number
  ustcBurnAmount?: number
  ustcBurnUsd?: number
}

export type BinodesDexTxDetail = {
  timestamp_utc?: string
  code?: number
  pair_addr?: string
  sender_addr?: string
  receiver_addr?: string
  ask_denom?: string
  ask_symbol?: string
  ask_amt_raw?: string
  ask_amt_actual?: number
  ask_amt_usd?: number
  offer_denom?: string
  offer_symbol?: string
  offer_amt_raw?: string
  offer_amt_actual?: number
  offer_amt_usd?: number
  spread_amt_raw?: string
  spread_amt_actual?: number
  spread_amt_usd?: number
  commission_amt_raw?: string
  commission_amt_actual?: number
  commission_amt_usd?: number
  tx_hash?: string
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

const fetchBinodes = async (url: string) => {
  const controller =
    typeof AbortController === "undefined" ? undefined : new AbortController()
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), BINODES_REQUEST_TIMEOUT_MS)
    : undefined

  try {
    return await fetch(url, { signal: controller?.signal })
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId)
    }
  }
}

const fetchBinodesList = async <T>(
  path: string,
  params: Record<string, string> = {}
) => {
  const response = await fetchBinodes(
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

const latestDate = (items: Array<{ dt?: string }>) =>
  items
    .map((item) => item.dt)
    .filter(Boolean)
    .sort()
    .at(-1)

const sumNumber = <T>(items: T[], getter: (item: T) => number | undefined) =>
  items.reduce((sum, item) => {
    const value = getter(item)
    return Number.isFinite(value) ? sum + Number(value) : sum
  }, 0)

const maxNumber = <T>(items: T[], getter: (item: T) => number | undefined) => {
  const values = items
    .map(getter)
    .filter((value): value is number => Number.isFinite(value))
  return values.length ? Math.max(...values) : undefined
}

const sumOrUndefined = <T>(
  items: T[],
  getter: (item: T) => number | undefined
) => (items.length ? sumNumber(items, getter) : undefined)

const aggregateNetworkOverview = (
  items: BinodesNetworkOverview[]
): BinodesNetworkOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    block_cnt: sumOrUndefined(items, (item) => item.block_cnt),
    tx_total_cnt: sumOrUndefined(items, (item) => item.tx_total_cnt),
    gas_used: sumOrUndefined(items, (item) => item.gas_used),
    gas_wanted: sumOrUndefined(items, (item) => item.gas_wanted),
    fee_gas_usd: sumOrUndefined(items, (item) => item.fee_gas_usd),
    fee_cp_usd: sumOrUndefined(items, (item) => item.fee_cp_usd),
    fee_op_usd: sumOrUndefined(items, (item) => item.fee_op_usd),
    fee_burn_usd: sumOrUndefined(items, (item) => item.fee_burn_usd),
    active_addr_cnt: maxNumber(items, (item) => item.active_addr_cnt),
    new_addr_cnt: sumOrUndefined(items, (item) => item.new_addr_cnt),
    ibc_tx_cnt: sumOrUndefined(items, (item) => item.ibc_tx_cnt),
    ibc_volume_usd: sumOrUndefined(items, (item) => item.ibc_volume_usd),
    net_ibc_flow_usd: sumOrUndefined(items, (item) => item.net_ibc_flow_usd),
    dex_tx_cnt: sumOrUndefined(items, (item) => item.dex_tx_cnt),
    dex_volume_usd: sumOrUndefined(items, (item) => item.dex_volume_usd),
    transfer_cnt: sumOrUndefined(items, (item) => item.transfer_cnt),
    transfer_amt_usd: sumOrUndefined(items, (item) => item.transfer_amt_usd)
  }
}

const aggregateDexOverview = (
  items: BinodesDexOverview[]
): BinodesDexOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    dex_volume_usd: sumOrUndefined(items, (item) => item.dex_volume_usd),
    dex_tx_cnt: sumOrUndefined(items, (item) => item.dex_tx_cnt),
    dex_swap_in_usd: sumOrUndefined(items, (item) => item.dex_swap_in_usd),
    dex_swap_out_usd: sumOrUndefined(items, (item) => item.dex_swap_out_usd),
    dex_spread_loss_usd: sumOrUndefined(items, (item) => item.dex_spread_loss_usd),
    dex_commission_paid_usd: sumOrUndefined(
      items,
      (item) => item.dex_commission_paid_usd
    ),
    dex_liquidity_add_usd: sumOrUndefined(
      items,
      (item) => item.dex_liquidity_add_usd
    ),
    dex_liquidity_remove_usd: sumOrUndefined(
      items,
      (item) => item.dex_liquidity_remove_usd
    )
  }
}

const aggregateBurnOverview = (
  items: BinodesBurnOverview[]
): BinodesBurnOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    fee_burn_usd: sumOrUndefined(items, (item) => item.fee_burn_usd),
    voluntary_burn_cnt: sumOrUndefined(items, (item) => item.voluntary_burn_cnt),
    voluntary_burn_usd: sumOrUndefined(items, (item) => item.voluntary_burn_usd)
  }
}

const aggregateBurnAssetOverview = (
  items: BinodesBurnAssetOverview[]
): BinodesBurnAssetOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    denom: items.find((item) => item.denom)?.denom,
    symbol: items.find((item) => item.symbol)?.symbol,
    fee_burn_amt_actual: sumOrUndefined(items, (item) => item.fee_burn_amt_actual),
    fee_burn_amt_usd: sumOrUndefined(items, (item) => item.fee_burn_amt_usd),
    voluntary_burn_cnt: sumOrUndefined(items, (item) => item.voluntary_burn_cnt),
    voluntary_burn_amt_actual: sumOrUndefined(
      items,
      (item) => item.voluntary_burn_amt_actual
    ),
    voluntary_burn_usd: sumOrUndefined(items, (item) => item.voluntary_burn_usd)
  }
}

const aggregateIbcOverview = (
  items: BinodesIbcOverview[]
): BinodesIbcOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    ibc_tx_in_cnt: sumOrUndefined(items, (item) => item.ibc_tx_in_cnt),
    ibc_volume_in_usd: sumOrUndefined(items, (item) => item.ibc_volume_in_usd),
    ibc_tx_out_cnt: sumOrUndefined(items, (item) => item.ibc_tx_out_cnt),
    ibc_volume_out_usd: sumOrUndefined(items, (item) => item.ibc_volume_out_usd),
    ibc_tx_cnt: sumOrUndefined(items, (item) => item.ibc_tx_cnt),
    ibc_volume_usd: sumOrUndefined(items, (item) => item.ibc_volume_usd),
    net_ibc_flow_usd: sumOrUndefined(items, (item) => item.net_ibc_flow_usd)
  }
}

const aggregateStakeOverview = (
  items: BinodesStakeOverview[]
): BinodesStakeOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    staking_delegate_cnt: sumOrUndefined(items, (item) => item.staking_delegate_cnt),
    staking_delegate_actual: sumOrUndefined(
      items,
      (item) => item.staking_delegate_actual
    ),
    staking_delegate_usd: sumOrUndefined(items, (item) => item.staking_delegate_usd),
    staking_undelegate_cnt: sumOrUndefined(
      items,
      (item) => item.staking_undelegate_cnt
    ),
    staking_undelegate_actual: sumOrUndefined(
      items,
      (item) => item.staking_undelegate_actual
    ),
    staking_undelegate_usd: sumOrUndefined(
      items,
      (item) => item.staking_undelegate_usd
    ),
    staking_redelegate_cnt: sumOrUndefined(
      items,
      (item) => item.staking_redelegate_cnt
    ),
    staking_redelegate_actual: sumOrUndefined(
      items,
      (item) => item.staking_redelegate_actual
    ),
    staking_redelegate_usd: sumOrUndefined(
      items,
      (item) => item.staking_redelegate_usd
    )
  }
}

const aggregateFeesOverview = (
  items: BinodesFeesOverview[]
): BinodesFeesOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    gas_wanted: sumOrUndefined(items, (item) => item.gas_wanted),
    gas_used: sumOrUndefined(items, (item) => item.gas_used),
    fee_gas_usd: sumOrUndefined(items, (item) => item.fee_gas_usd),
    fee_cp_usd: sumOrUndefined(items, (item) => item.fee_cp_usd),
    fee_op_usd: sumOrUndefined(items, (item) => item.fee_op_usd)
  }
}

const aggregateGovernanceOverview = (
  items: BinodesGovernanceOverview[]
): BinodesGovernanceOverview | undefined => {
  if (!items.length) return undefined
  return {
    dt: latestDate(items),
    gov_deposit_cnt: sumOrUndefined(items, (item) => item.gov_deposit_cnt),
    gov_deposit_actual: sumOrUndefined(items, (item) => item.gov_deposit_actual),
    gov_deposit_usd: sumOrUndefined(items, (item) => item.gov_deposit_usd),
    gov_proposal_submit_cnt: sumOrUndefined(
      items,
      (item) => item.gov_proposal_submit_cnt
    ),
    gov_vote_cnt: sumOrUndefined(items, (item) => item.gov_vote_cnt),
    gov_vote_yes_cnt: sumOrUndefined(items, (item) => item.gov_vote_yes_cnt),
    gov_vote_no_cnt: sumOrUndefined(items, (item) => item.gov_vote_no_cnt),
    gov_vote_veto_cnt: sumOrUndefined(items, (item) => item.gov_vote_veto_cnt),
    gov_vote_abstain_cnt: sumOrUndefined(
      items,
      (item) => item.gov_vote_abstain_cnt
    )
  }
}

const buildDashboardSeries = (
  networkItems: BinodesNetworkOverview[],
  burnsItems: BinodesBurnOverview[],
  feesItems: BinodesFeesOverview[],
  stakeItems: BinodesStakeOverview[],
  luncBurnItems: BinodesBurnAssetOverview[],
  ustcBurnItems: BinodesBurnAssetOverview[]
): BinodesDashboardSeriesPoint[] => {
  const byDate = new Map<string, BinodesDashboardSeriesPoint>()

  const ensurePoint = (dt?: string) => {
    if (!dt) return undefined
    const existing = byDate.get(dt)
    if (existing) return existing
    const next: BinodesDashboardSeriesPoint = { dt }
    byDate.set(dt, next)
    return next
  }

  const setFinite = (
    point: BinodesDashboardSeriesPoint | undefined,
    key: keyof Omit<BinodesDashboardSeriesPoint, "dt">,
    value?: number
  ) => {
    if (!point || !Number.isFinite(value)) return
    point[key] = Number(value)
  }

  networkItems.forEach((item) => {
    const point = ensurePoint(item.dt)
    setFinite(point, "txTotalCnt", item.tx_total_cnt)
    setFinite(point, "transferAmountUsd", item.transfer_amt_usd)
    setFinite(point, "activeAddressCount", item.active_addr_cnt)
    setFinite(point, "feeGasUsd", item.fee_gas_usd)
    setFinite(point, "feeCpUsd", item.fee_cp_usd)
    setFinite(point, "feeOpUsd", item.fee_op_usd)
    setFinite(point, "feeBurnUsd", item.fee_burn_usd)
  })

  feesItems.forEach((item) => {
    const point = ensurePoint(item.dt)
    setFinite(point, "feeGasUsd", item.fee_gas_usd)
    setFinite(point, "feeCpUsd", item.fee_cp_usd)
    setFinite(point, "feeOpUsd", item.fee_op_usd)
  })

  burnsItems.forEach((item) => {
    const point = ensurePoint(item.dt)
    setFinite(point, "feeBurnUsd", item.fee_burn_usd)
    setFinite(point, "voluntaryBurnUsd", item.voluntary_burn_usd)
  })

  stakeItems.forEach((item) => {
    const point = ensurePoint(item.dt)
    setFinite(point, "stakingDelegateUsd", item.staking_delegate_usd)
    setFinite(point, "stakingUndelegateUsd", item.staking_undelegate_usd)
  })

  const appendBurnAsset = (
    items: BinodesBurnAssetOverview[],
    amountKey: "luncBurnAmount" | "ustcBurnAmount",
    usdKey: "luncBurnUsd" | "ustcBurnUsd"
  ) => {
    items.forEach((item) => {
      const point = ensurePoint(item.dt)
      const amount =
        (item.fee_burn_amt_actual ?? 0) +
        (item.voluntary_burn_amt_actual ?? 0)
      const usd = (item.fee_burn_amt_usd ?? 0) + (item.voluntary_burn_usd ?? 0)
      setFinite(point, amountKey, amount)
      setFinite(point, usdKey, usd)
    })
  }

  appendBurnAsset(luncBurnItems, "luncBurnAmount", "luncBurnUsd")
  appendBurnAsset(ustcBurnItems, "ustcBurnAmount", "ustcBurnUsd")

  return Array.from(byDate.values())
    .map((point) => {
      const totalFeeUsd =
        (point.feeGasUsd ?? 0) +
        (point.feeCpUsd ?? 0) +
        (point.feeOpUsd ?? 0) +
        (point.feeBurnUsd ?? 0)
      const burnUsd = (point.feeBurnUsd ?? 0) + (point.voluntaryBurnUsd ?? 0)
      return {
        ...point,
        totalFeeUsd: totalFeeUsd || undefined,
        burnUsd: burnUsd || undefined
      }
    })
    .sort((a, b) => a.dt.localeCompare(b.dt))
}

const settleList = async <T>(
  path: string,
  params?: Record<string, string>
) => {
  try {
    return {
      failed: false,
      items: await fetchBinodesList<T>(path, params)
    }
  } catch {
    return {
      failed: true,
      items: []
    }
  }
}

export const fetchBinodesDexTxDetails = async ({
  pairAddress,
  limit = 25
}: {
  pairAddress: string
  limit?: number
}) => {
  const safeLimit = Math.max(1, Math.min(Math.ceil(limit), 500))
  const pageSize = Math.min(safeLimit, 100)
  const pages = Math.ceil(safeLimit / pageSize)
  const items: BinodesDexTxDetail[] = []

  for (let page = 1; page <= pages; page += 1) {
    const remaining = safeLimit - items.length
    if (remaining <= 0) break

    const pageItems = await fetchBinodesList<BinodesDexTxDetail>("/v1/dex/tx_details", {
      address: pairAddress.toLowerCase(),
      limit: String(Math.min(pageSize, remaining)),
      page_size: String(Math.min(pageSize, remaining)),
      page: String(page)
    })

    items.push(...pageItems)
    if (pageItems.length < pageSize) break
  }

  return items.slice(0, safeLimit)
}

export const fetchBinodesDashboardActivity = async (
  frequency: BinodesDashboardFrequency = "HOUR",
  bucketLimit = 50
): Promise<BinodesDashboardActivity> => {
  const limit = Math.max(1, Math.min(Math.ceil(bucketLimit), 5000))
  const params = {
    limit: String(limit),
    freq: frequency
  }
  const [
    networkResult,
    burnsResult,
    feesResult,
    stakeResult,
    luncBurnResult,
    ustcBurnResult
  ] = await Promise.all([
    settleList<BinodesNetworkOverview>("/v1/network/overview", params),
    settleList<BinodesBurnOverview>("/v1/burns/overview", params),
    settleList<BinodesFeesOverview>("/v1/fees/overview", params),
    settleList<BinodesStakeOverview>("/v1/stake/overview", params),
    settleList<BinodesBurnAssetOverview>("/v1/burns/assets_info", {
      ...params,
      asset: "LUNC"
    }),
    settleList<BinodesBurnAssetOverview>("/v1/burns/assets_info", {
      ...params,
      asset: "USTC"
    })
  ])
  if ([networkResult, burnsResult, feesResult].every((result) => result.failed)) {
    throw new Error("BiNodes dashboard activity unavailable")
  }
  const networkItems = networkResult.items
  const burnsItems = burnsResult.items
  const feesItems = feesResult.items
  const dexItems: BinodesDexOverview[] = []
  const ibcItems: BinodesIbcOverview[] = []
  const stakeItems = stakeResult.items
  const luncBurnItems = luncBurnResult.items
  const ustcBurnItems = ustcBurnResult.items
  const governanceItems: BinodesGovernanceOverview[] = []

  return {
    fetchedAt: new Date().toISOString(),
    bucketCount: Math.max(
      networkItems.length,
      dexItems.length,
      burnsItems.length,
      ibcItems.length,
      stakeItems.length,
      feesItems.length,
      governanceItems.length
    ),
    frequency,
    series: buildDashboardSeries(
      networkItems,
      burnsItems,
      feesItems,
      stakeItems,
      luncBurnItems,
      ustcBurnItems
    ),
    network: aggregateNetworkOverview(networkItems),
    dex: aggregateDexOverview(dexItems),
    burns: aggregateBurnOverview(burnsItems),
    ibc: aggregateIbcOverview(ibcItems),
    stake: aggregateStakeOverview(stakeItems),
    fees: aggregateFeesOverview(feesItems),
    governance: aggregateGovernanceOverview(governanceItems),
    luncBurns: aggregateBurnAssetOverview(luncBurnItems),
    ustcBurns: aggregateBurnAssetOverview(ustcBurnItems)
  }
}
