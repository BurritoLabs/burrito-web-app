import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

export type DashboardSnapshot = {
  timestamp: number
  height?: number
  luncSupply: number
  ustcSupply: number
  luncCommunity: number
  ustcCommunity: number
  luncOracle: number
  ustcOracle: number
  luncBurned: number
  ustcBurned: number
  circulatingLunc: number
  circulatingUstc: number
  stakedLunc: number
  stakingRatio: number
  activeValidators?: number
  maxValidators?: number
  unbondingTimeSec?: number
  blockHeight?: number
  blockTimeMs?: number
}

export type TxVolumePoint = {
  time: number
  value: number
}

export type TxCountBucket = {
  time: number
  count: number
}

const FCD_BASE = "https://terra-classic-fcd.publicnode.com"
const CLASSICTERRA_BASE = "https://classicterra.money"
const ORACLE_POOL_ADDRESS = "terra1jgp27m8fykex4e4jtt0l7ze8q528ux2lh4zh0f"
const BURN_ADDRESS = "terra1sk06e3dyexuq4shw77y3dsv480xv42mq73anxu"

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
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return url.toString()
}

const toNumber = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return 0
  const parsed = typeof value === "string" ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : 0
}

const toUnit = (value?: string | number, decimals = 6) => {
  const num = toNumber(value)
  return num / 10 ** decimals
}

const sumCommunity = (pool: Record<string, string>, denom: string) => {
  const value = pool?.[denom]
  return toUnit(value)
}

const DASH_CACHE_PREFIX = "burritoDashboardSnapshot"
const DASH_TX_CACHE_PREFIX = "burritoDashboardTxCounts"

const getCachedSnapshot = (key: string, maxAgeMs: number) => {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(`${DASH_CACHE_PREFIX}:${key}`)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { ts: number; data: DashboardSnapshot }
    if (!parsed?.data || !parsed?.ts) return undefined
    if (
      parsed.data.luncOracle === undefined ||
      parsed.data.ustcOracle === undefined ||
      parsed.data.luncBurned === undefined ||
      parsed.data.ustcBurned === undefined
    ) {
      return undefined
    }
    if (Date.now() - parsed.ts > maxAgeMs) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

const setCachedSnapshot = (key: string, data: DashboardSnapshot) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      `${DASH_CACHE_PREFIX}:${key}`,
      JSON.stringify({ ts: Date.now(), data })
    )
  } catch {
    // ignore
  }
}

const getCachedTxCounts = (key: string, maxAgeMs: number) => {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(`${DASH_TX_CACHE_PREFIX}:${key}`)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { ts: number; data: number[] }
    if (!parsed?.data || !parsed?.ts) return undefined
    if (Date.now() - parsed.ts > maxAgeMs) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

const setCachedTxCounts = (key: string, data: number[]) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      `${DASH_TX_CACHE_PREFIX}:${key}`,
      JSON.stringify({ ts: Date.now(), data })
    )
  } catch {
    // ignore
  }
}

const DASH_FEE_CACHE_PREFIX = "burritoDashboardTxFees"

const getCachedTxFees = (key: string, maxAgeMs: number) => {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(`${DASH_FEE_CACHE_PREFIX}:${key}`)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { ts: number; data: { lunc: number; ustc: number } }
    if (!parsed?.data || !parsed?.ts) return undefined
    if (Date.now() - parsed.ts > maxAgeMs) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

const setCachedTxFees = (key: string, data: { lunc: number; ustc: number }) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      `${DASH_FEE_CACHE_PREFIX}:${key}`,
      JSON.stringify({ ts: Date.now(), data })
    )
  } catch {
    // ignore
  }
}

type FcdDashboard = {
  issuances?: Record<string, string>
  communityPool?: Record<string, string>
  stakingPool?: { stakingRatio?: string; bondedTokens?: string }
}

export const fetchFcdDashboard = async () => {
  return fetchJson<FcdDashboard>(`${FCD_BASE}/v1/dashboard`)
}

export const fetchTxVolume = async () => {
  return fetchJson<{
    periodic?: Array<{ denom: string; data: Array<{ datetime: number; txVolume: string }> }>
  }>(`${FCD_BASE}/v1/dashboard/tx_volume`)
}

type FcdTxList = {
  next?: number
  txs?: Array<any>
}

export const fetchTaxProceeds = async (height?: number) => {
  const params: Record<string, string> = {}
  if (height) params.height = String(height)
  const url = buildUrl(CLASSIC_CHAIN.lcd, "/terra/treasury/v1beta1/tax_proceeds", params)
  const data = await fetchJson<{ tax_proceeds?: Array<{ denom?: string; amount?: string }> }>(url)
  const proceeds = data?.tax_proceeds ?? []
  const lookup: Record<string, string> = {}
  proceeds.forEach((coin) => {
    if (coin?.denom && coin?.amount) {
      lookup[coin.denom] = coin.amount
    }
  })
  return {
    lunc: toNumber(lookup[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0"),
    ustc: toNumber(lookup[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
  }
}

export const fetchTxCountBuckets = async (
  rangeMs: number,
  bucketMs: number,
  ttlMs: number,
  maxPages = 40
): Promise<number[]> => {
  const cacheKey = `${rangeMs}:${bucketMs}`
  const cached = getCachedTxCounts(cacheKey, ttlMs)
  if (cached) return cached

  const endMs = Date.now()
  const startMs = endMs - rangeMs
  const buckets = Math.max(1, Math.ceil(rangeMs / bucketMs))
  const counts = Array.from({ length: buckets }, () => 0)

  let next: number | undefined

  for (let page = 0; page < maxPages; page += 1) {
    const params: Record<string, string> = { limit: "100" }
    if (next) params.offset = String(next)
    const url = buildUrl(FCD_BASE, "/v1/txs", params)
    const data = await fetchJson<FcdTxList>(url)
    const txs = data?.txs ?? []
    if (!txs.length) break

    for (const tx of txs) {
      const ts = tx?.timestamp ? new Date(tx.timestamp).getTime() : 0
      if (!ts) continue
      if (ts < startMs) {
        setCachedTxCounts(cacheKey, counts)
        return counts
      }
      if (ts > endMs) continue
      const index = Math.floor((ts - startMs) / bucketMs)
      if (index >= 0 && index < counts.length) {
        counts[index] += 1
      }
    }

    next = data?.next
    if (!next) break
  }

  setCachedTxCounts(cacheKey, counts)
  return counts
}

const normalizeFeeCoins = (value: any): Array<{ denom?: string; amount?: string }> => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "object" && value.denom && value.amount) return [value]
  if (typeof value === "object" && Array.isArray(value.amount)) return value.amount
  return []
}

const extractFeeCoins = (tx: any) => {
  return (
    tx?.tx?.auth_info?.fee?.amount ??
    tx?.tx?.value?.fee?.amount ??
    tx?.tx?.fee?.amount ??
    tx?.fee?.amount ??
    []
  )
}

export const fetchTxFeeTotals = async (
  rangeMs: number,
  offsetMs: number,
  ttlMs: number,
  maxPages = 200
): Promise<{ lunc: number; ustc: number }> => {
  const cacheKey = `${rangeMs}:${offsetMs}`
  const cached = getCachedTxFees(cacheKey, ttlMs)
  if (cached) return cached

  const endMs = Date.now() - offsetMs
  const startMs = endMs - rangeMs
  let next: number | undefined
  let totalLunc = 0
  let totalUstc = 0

  for (let page = 0; page < maxPages; page += 1) {
    const params: Record<string, string> = { limit: "100" }
    if (next) params.offset = String(next)
    const url = buildUrl(FCD_BASE, "/v1/txs", params)
    const data = await fetchJson<FcdTxList>(url)
    const txs = data?.txs ?? []
    if (!txs.length) break

    for (const tx of txs) {
      const ts = tx?.timestamp ? new Date(tx.timestamp).getTime() : 0
      if (!ts) continue
      if (ts < startMs) {
        const result = { lunc: totalLunc, ustc: totalUstc }
        setCachedTxFees(cacheKey, result)
        return result
      }
      if (ts > endMs) continue

      const feeCoins = normalizeFeeCoins(extractFeeCoins(tx))
      feeCoins.forEach((coin) => {
        const denom = coin?.denom
        const amount = toNumber(coin?.amount ?? "0")
        if (!denom || !amount) return
        if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
          totalLunc += amount
        } else if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
          totalUstc += amount
        }
      })
    }

    next = data?.next
    if (!next) break
  }

  const result = { lunc: totalLunc, ustc: totalUstc }
  setCachedTxFees(cacheKey, result)
  return result
}

const fetchLatestBlock = async () => {
  const data = await fetchJson<{
    block?: { header?: { height?: string; time?: string } }
  }>(buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/base/tendermint/v1beta1/blocks/latest"))
  const height = Number(data?.block?.header?.height ?? 0)
  const time = data?.block?.header?.time
  return {
    height,
    timeMs: time ? new Date(time).getTime() : Date.now()
  }
}

const parseDurationToSeconds = (value?: string) => {
  if (!value) return 0
  const match = value.match(/(\d+)/)
  if (!match) return 0
  return Number(match[1])
}

const fetchStakingParams = async () => {
  const data = await fetchJson<{ params?: { unbonding_time?: string; max_validators?: string } }>(
    buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/staking/v1beta1/params")
  )
  return {
    unbondingTimeSec: parseDurationToSeconds(data?.params?.unbonding_time),
    maxValidators: toNumber(data?.params?.max_validators ?? "0")
  }
}

const fetchActiveValidatorCount = async () => {
  const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/staking/v1beta1/validators", {
    status: "BOND_STATUS_BONDED",
    "pagination.limit": "1",
    "pagination.count_total": "true"
  })
  const data = await fetchJson<{ pagination?: { total?: string } }>(url)
  return toNumber(data?.pagination?.total ?? "0")
}

const fetchBlockByHeight = async (height: number) => {
  try {
    const data = await fetchJson<{
      block?: { header?: { height?: string; time?: string } }
    }>(
      buildUrl(CLASSIC_CHAIN.lcd, `/cosmos/base/tendermint/v1beta1/blocks/${height}`)
    )
    const time = data?.block?.header?.time
    const parsedHeight = Number(data?.block?.header?.height ?? 0)
    if (!time || !parsedHeight) return null
    return {
      height: parsedHeight,
      timeMs: new Date(time).getTime()
    }
  } catch {
    return null
  }
}

const findHeightByTimestamp = async (targetMs: number) => {
  const latest = await fetchLatestBlock()
  if (targetMs >= latest.timeMs) return latest.height

  const avgBlockMs = 6000
  const diffBlocks = Math.max(1, Math.round((latest.timeMs - targetMs) / avgBlockMs))
  let low = Math.max(1, latest.height - diffBlocks * 2)
  let high = latest.height

  let lowBlock = await fetchBlockByHeight(low)
  if (!lowBlock) {
    const fallbackHeights = [
      latest.height - diffBlocks,
      latest.height - Math.round(diffBlocks * 0.75),
      latest.height - Math.round(diffBlocks * 0.5)
    ]
    for (const h of fallbackHeights) {
      if (h <= 1) continue
      const probe = await fetchBlockByHeight(h)
      if (probe) {
        low = h
        lowBlock = probe
        break
      }
    }
  }
  if (!lowBlock) return latest.height
  if (targetMs <= lowBlock.timeMs) return low

  let result = low
  let left = low
  let right = high

  for (let i = 0; i < 24 && left <= right; i += 1) {
    const mid = Math.floor((left + right) / 2)
    const block = await fetchBlockByHeight(mid)
    if (!block) {
      left = mid + 1
      continue
    }
    if (block.timeMs <= targetMs) {
      result = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return result
}

const fetchSupplyByDenom = async (denom: string, height?: number) => {
  const params: Record<string, string> = { denom }
  if (height) params.height = String(height)
  const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/bank/v1beta1/supply/by_denom", params)
  const data = await fetchJson<{ amount?: { amount?: string } }>(url)
  return toUnit(data?.amount?.amount ?? "0")
}

const fetchCommunityPool = async (height?: number) => {
  const params: Record<string, string> = {}
  if (height) params.height = String(height)
  const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/distribution/v1beta1/community_pool", params)
  const data = await fetchJson<{ pool?: Array<{ denom?: string; amount?: string }> }>(url)
  const pool = data?.pool ?? []
  const lookup: Record<string, string> = {}
  pool.forEach((coin) => {
    if (coin?.denom && coin?.amount) {
      lookup[coin.denom] = coin.amount
    }
  })
  return {
    lunc: toUnit(lookup[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0"),
    ustc: toUnit(lookup[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
  }
}

const fetchOraclePool = async (height?: number) => {
  const parseBalances = (data?: { balances?: Array<{ denom?: string; amount?: string }> }) => {
    const balances = data?.balances ?? []
    const lookup: Record<string, string> = {}
    balances.forEach((coin) => {
      if (coin?.denom && coin?.amount) {
        lookup[coin.denom] = coin.amount
      }
    })
    return {
      lunc: toUnit(lookup[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0"),
      ustc: toUnit(lookup[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
    }
  }

  try {
    const params: Record<string, string> = {}
    if (height) params.height = String(height)
    const url = buildUrl(
      CLASSIC_CHAIN.lcd,
      `/cosmos/bank/v1beta1/balances/${ORACLE_POOL_ADDRESS}`,
      params
    )
    const data = await fetchJson<{ balances?: Array<{ denom?: string; amount?: string }> }>(url)
    return parseBalances(data)
  } catch {
    if (height) {
      try {
        const url = buildUrl(
          CLASSIC_CHAIN.lcd,
          `/cosmos/bank/v1beta1/balances/${ORACLE_POOL_ADDRESS}`
        )
        const data = await fetchJson<{ balances?: Array<{ denom?: string; amount?: string }> }>(url)
        return parseBalances(data)
      } catch {
        return { lunc: 0, ustc: 0 }
      }
    }
    return { lunc: 0, ustc: 0 }
  }
}

const fetchBurnedTotals = async (height?: number) => {
  const parseBalances = (data?: { balances?: Array<{ denom?: string; amount?: string }> }) => {
    const balances = data?.balances ?? []
    const lookup: Record<string, string> = {}
    balances.forEach((coin) => {
      if (coin?.denom && coin?.amount) {
        lookup[coin.denom] = coin.amount
      }
    })
    return {
      lunc: toUnit(lookup[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0"),
      ustc: toUnit(lookup[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
    }
  }

  try {
    const params: Record<string, string> = {}
    if (height) params.height = String(height)
    const url = buildUrl(
      CLASSIC_CHAIN.lcd,
      `/cosmos/bank/v1beta1/balances/${BURN_ADDRESS}`,
      params
    )
    const data = await fetchJson<{ balances?: Array<{ denom?: string; amount?: string }> }>(url)
    return parseBalances(data)
  } catch {
    if (height) {
      try {
        const url = buildUrl(
          CLASSIC_CHAIN.lcd,
          `/cosmos/bank/v1beta1/balances/${BURN_ADDRESS}`
        )
        const data = await fetchJson<{ balances?: Array<{ denom?: string; amount?: string }> }>(url)
        return parseBalances(data)
      } catch {
        return { lunc: 0, ustc: 0 }
      }
    }
    return { lunc: 0, ustc: 0 }
  }
}

const fetchStakingPoolAtHeight = async (height?: number) => {
  const params: Record<string, string> = {}
  if (height) params.height = String(height)
  const url = buildUrl(CLASSIC_CHAIN.lcd, "/cosmos/staking/v1beta1/pool", params)
  const data = await fetchJson<{ pool?: { bonded_tokens?: string } }>(url)
  return toUnit(data?.pool?.bonded_tokens ?? "0")
}

const fetchClassicCirculatingSupply = async (
  denom: "lunc" | "ustc",
  height?: number
) => {
  const path = denom === "lunc" ? "/api/v1/csupply" : "/api/v1/csupply/ustc"
  const params: Record<string, string> = {}
  if (height) params.height = String(height)
  const url = buildUrl(CLASSICTERRA_BASE, path, params)
  const data = await fetchJson<number | string>(url)
  return toNumber(data)
}

export const fetchCurrentDashboardSnapshot = async (): Promise<DashboardSnapshot> => {
  const [
    data,
    latestBlock,
    stakingParams,
    activeValidators,
    circulatingLuncRaw,
    circulatingUstcRaw,
    oraclePool,
    burnedTotals
  ] = await Promise.all([
    fetchFcdDashboard(),
    fetchLatestBlock(),
    fetchStakingParams(),
    fetchActiveValidatorCount(),
    fetchClassicCirculatingSupply("lunc"),
    fetchClassicCirculatingSupply("ustc"),
    fetchOraclePool(),
    fetchBurnedTotals()
  ])
  const previousBlock =
    latestBlock.height > 1 ? await fetchBlockByHeight(latestBlock.height - 1) : null
  const blockIntervalMs = previousBlock
    ? Math.max(0, latestBlock.timeMs - previousBlock.timeMs)
    : undefined
  const issuances = data?.issuances ?? {}
  const pool = data?.communityPool ?? {}
  const luncSupply = toUnit(issuances[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0")
  const ustcSupply = toUnit(issuances[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
  const luncCommunity = sumCommunity(pool, CLASSIC_DENOMS.lunc.coinMinimalDenom)
  const ustcCommunity = sumCommunity(pool, CLASSIC_DENOMS.ustc.coinMinimalDenom)
  const stakedLunc = toUnit(data?.stakingPool?.bondedTokens ?? "0")
  const stakingRatio = toNumber(data?.stakingPool?.stakingRatio ?? "0")
  const circulatingLuncFallback = Math.max(luncSupply - luncCommunity - stakedLunc, 0)
  const circulatingUstcFallback = Math.max(ustcSupply - ustcCommunity, 0)
  const circulatingLunc =
    circulatingLuncRaw > 0 ? circulatingLuncRaw : circulatingLuncFallback
  const circulatingUstc =
    circulatingUstcRaw > 0 ? circulatingUstcRaw : circulatingUstcFallback

  return {
    timestamp: Date.now(),
    luncSupply,
    ustcSupply,
    luncCommunity,
    ustcCommunity,
    luncOracle: oraclePool.lunc,
    ustcOracle: oraclePool.ustc,
    luncBurned: burnedTotals.lunc,
    ustcBurned: burnedTotals.ustc,
    circulatingLunc,
    circulatingUstc,
    stakedLunc,
    stakingRatio,
    activeValidators,
    maxValidators: stakingParams.maxValidators,
    unbondingTimeSec: stakingParams.unbondingTimeSec,
    blockHeight: latestBlock.height,
    blockTimeMs: blockIntervalMs
  }
}

export const fetchHistoricalDashboardSnapshot = async (
  rangeKey: string,
  rangeMs: number,
  ttlMs: number
): Promise<DashboardSnapshot> => {
  const cached = getCachedSnapshot(rangeKey, ttlMs)
  if (cached) return cached

  const targetMs = Date.now() - rangeMs
  const height = await findHeightByTimestamp(targetMs)

  const [
    luncSupply,
    ustcSupply,
    community,
    stakedLunc,
    circulatingLuncRaw,
    circulatingUstcRaw,
    oraclePool,
    burnedTotals
  ] = await Promise.all([
    fetchSupplyByDenom(CLASSIC_DENOMS.lunc.coinMinimalDenom, height),
    fetchSupplyByDenom(CLASSIC_DENOMS.ustc.coinMinimalDenom, height),
    fetchCommunityPool(height),
    fetchStakingPoolAtHeight(height),
    fetchClassicCirculatingSupply("lunc", height),
    fetchClassicCirculatingSupply("ustc", height),
    fetchOraclePool(height),
    fetchBurnedTotals(height)
  ])

  const circulatingLuncFallback = Math.max(luncSupply - community.lunc - stakedLunc, 0)
  const circulatingUstcFallback = Math.max(ustcSupply - community.ustc, 0)
  const circulatingLunc =
    circulatingLuncRaw > 0 ? circulatingLuncRaw : circulatingLuncFallback
  const circulatingUstc =
    circulatingUstcRaw > 0 ? circulatingUstcRaw : circulatingUstcFallback

  const snapshot: DashboardSnapshot = {
    timestamp: targetMs,
    height,
    luncSupply,
    ustcSupply,
    luncCommunity: community.lunc,
    ustcCommunity: community.ustc,
    luncOracle: oraclePool.lunc,
    ustcOracle: oraclePool.ustc,
    luncBurned: burnedTotals.lunc,
    ustcBurned: burnedTotals.ustc,
    circulatingLunc,
    circulatingUstc,
    stakedLunc,
    stakingRatio: luncSupply ? stakedLunc / luncSupply : 0
  }

  setCachedSnapshot(rangeKey, snapshot)
  return snapshot
}

export const buildTxVolumeSeries = (
  data: Awaited<ReturnType<typeof fetchTxVolume>>,
  denom = CLASSIC_DENOMS.lunc.coinMinimalDenom
): TxVolumePoint[] => {
  const periodic = data?.periodic ?? []
  const entry = periodic.find((item) => item.denom === denom)
  if (!entry) return []
  return (entry.data ?? [])
    .map((point) => ({
      time: point.datetime,
      value: toUnit(point.txVolume ?? "0")
    }))
    .sort((a, b) => a.time - b.time)
}
