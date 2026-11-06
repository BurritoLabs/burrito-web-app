import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import { CLASSIC_CHAIN_CONFIG, LUNA_CHAIN_CONFIG } from "../config/chainConfig"
import { fetchJsonWithEndpointFallback } from "./endpointFallback"
import { withRequestDeadline } from "./requestDeadline"

export type DashboardSnapshot = {
  timestamp: number
  height?: number
  luncSupply?: number
  ustcSupply?: number
  luncCommunity?: number
  ustcCommunity?: number
  luncOracle?: number
  ustcOracle?: number
  luncBurned?: number
  ustcBurned?: number
  circulatingLunc?: number
  circulatingUstc?: number
  stakedLunc?: number
  stakingRatio?: number
  activeValidators?: number
  maxValidators?: number
  unbondingTimeSec?: number
  blockHeight?: number
  blockTimeMs?: number
  inflation?: number
  coverage?: "complete" | "partial"
  sourceIssues?: string[]
  stale?: boolean
  fetchedAt?: number
}

export type CirculatingSnapshot = Pick<
  DashboardSnapshot,
  "circulatingLunc" | "circulatingUstc"
>

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

const fetchJson = async <T>(url: string): Promise<T> => withRequestDeadline(async (signal) => {
  const response = await fetchJsonWithEndpointFallback<T>(url, { signal, timeoutMs: 2_000 })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.data as T
}, { timeoutMs: 8_000 })

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
    if (!key.endsWith(":v2:current") && (
      parsed.data.luncOracle === undefined ||
      parsed.data.ustcOracle === undefined ||
      parsed.data.luncBurned === undefined ||
      parsed.data.ustcBurned === undefined
    )) {
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
  txs?: FcdTx[]
}

type FeeCoin = {
  denom?: string
  amount?: string
}

type FcdTx = {
  timestamp?: string
  tx?: {
    auth_info?: { fee?: { amount?: unknown } }
    value?: { fee?: { amount?: unknown } }
    fee?: { amount?: unknown }
  }
  fee?: { amount?: unknown }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isFeeCoin = (value: unknown): value is FeeCoin =>
  isRecord(value) &&
  (value.denom === undefined || typeof value.denom === "string") &&
  (value.amount === undefined || typeof value.amount === "string")

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

const normalizeFeeCoins = (value: unknown): FeeCoin[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(isFeeCoin)
  if (isFeeCoin(value) && value.denom && value.amount) return [value]
  if (isRecord(value) && Array.isArray(value.amount)) {
    return value.amount.filter(isFeeCoin)
  }
  return []
}

const extractFeeCoins = (tx: FcdTx) => {
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
  const high = latest.height

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
  if (typeof window !== "undefined") {
    return 0
  }
  const path = denom === "lunc" ? "/api/v1/csupply" : "/api/v1/csupply/ustc"
  const params: Record<string, string> = {}
  if (height) params.height = String(height)
  const url = buildUrl(CLASSICTERRA_BASE, path, params)
  const data = await fetchJson<number | string>(url)
  return toNumber(data)
}

export const fetchCirculatingSnapshot = async (): Promise<CirculatingSnapshot> => {
  const [data, circulatingLuncRaw, circulatingUstcRaw] = await Promise.all([
    fetchFcdDashboard(),
    fetchClassicCirculatingSupply("lunc"),
    fetchClassicCirculatingSupply("ustc")
  ])

  const issuances = data?.issuances ?? {}
  const pool = data?.communityPool ?? {}
  const luncSupply = toUnit(issuances[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0")
  const ustcSupply = toUnit(issuances[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
  const luncCommunity = sumCommunity(pool, CLASSIC_DENOMS.lunc.coinMinimalDenom)
  const ustcCommunity = sumCommunity(pool, CLASSIC_DENOMS.ustc.coinMinimalDenom)
  const stakedLunc = toUnit(data?.stakingPool?.bondedTokens ?? "0")
  const circulatingLuncFallback = Math.max(luncSupply - luncCommunity - stakedLunc, 0)
  const circulatingUstcFallback = Math.max(ustcSupply - ustcCommunity, 0)

  return {
    circulatingLunc:
      circulatingLuncRaw > 0 ? circulatingLuncRaw : circulatingLuncFallback,
    circulatingUstc:
      circulatingUstcRaw > 0 ? circulatingUstcRaw : circulatingUstcFallback
  }
}

// A fixed fan-out of independent sources. Each entire source (including JSON and
// endpoint retries) is bounded; a failed source never discards another's values.
const currentSnapshotRequests = new Map<string, Promise<DashboardSnapshot>>()
const snapshotNumber = (value: unknown): number | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  if (typeof value === "string" && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}
const snapshotRatio = (value: unknown) => {
  const number = snapshotNumber(value)
  return number !== undefined && number <= 1 ? number : undefined
}
const snapshotUnit = (value: unknown) => {
  const number = snapshotNumber(value)
  return number === undefined ? undefined : number / 1_000_000
}
const requiredNumber = (value: unknown) => {
  const number = snapshotNumber(value)
  if (number === undefined) throw new Error("Missing source value")
  return number
}
const requiredInteger = (value: unknown, minimum = 0) => {
  const number = requiredNumber(value)
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error("Invalid source integer")
  return number
}
type SnapshotCoins = { denom?: string; amount?: string }[]
const snapshotCoins = (coins: unknown) => {
  if (!Array.isArray(coins)) throw new Error("Missing source balances")
  const result = new Map<string, number>()
  for (const coin of coins) {
    if (!isRecord(coin) || Array.isArray(coin) || typeof coin.denom !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9/:._-]{2,127}$/.test(coin.denom) || result.has(coin.denom)) {
      throw new Error("Invalid source balance")
    }
    result.set(coin.denom, requiredNumber(coin.amount) / 1_000_000)
  }
  // An absent denomination in a successfully returned balance list is zero.
  return { lunc: result.get("uluna") ?? 0, ustc: result.get("uusd") ?? 0 }
}
const currentJson = <T>(url: string, budgetMs = 3_500) => withRequestDeadline(async (signal) => {
  const response = await fetchJsonWithEndpointFallback<T>(url, { signal, timeoutMs: 1_000 })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.data as T
}, { timeoutMs: budgetMs })

const fetchCurrentSnapshot = (phoenix: boolean): Promise<DashboardSnapshot> => {
  // Capture immutable chain context before the first await. A tab switch cannot
  // redirect in-flight Classic fallback reads into Phoenix (or its cache).
  const chain = phoenix ? LUNA_CHAIN_CONFIG : CLASSIC_CHAIN_CONFIG
  const cacheKey = `${chain.chainId}:v2:current`
  const cached = getCachedSnapshot(cacheKey, 60_000)
  if (cached?.coverage === "complete") return Promise.resolve(cached)
  const inFlight = currentSnapshotRequests.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async () => {
    const sourceIssues = new Set<string>()
    const read = async <T>(source: string, operation: () => Promise<T>): Promise<T | undefined> => {
      try { return await operation() } catch { sourceIssues.add(source); return undefined }
    }
    const lcd = <T>(path: string, budgetMs?: number) => currentJson<T>(buildUrl(chain.lcd, path), budgetMs)
    const fcd = phoenix ? Promise.resolve(undefined) : read("fcd-dashboard", async () => {
      const data = await currentJson<FcdDashboard>(`${FCD_BASE}/v1/dashboard`, 2_500)
      if (!data || !data.issuances) throw new Error("Missing dashboard source")
      return data
    })
    const supply = (denom: string) => read(`supply-${denom}`, async () => {
      const dashboard = await fcd
      const fromFcd = snapshotUnit(dashboard?.issuances?.[denom])
      if (fromFcd !== undefined) return fromFcd
      const data = await lcd<{ amount?: { amount?: string } }>(`/cosmos/bank/v1beta1/supply/by_denom?denom=${denom}`)
      return requiredNumber(data?.amount?.amount) / 1_000_000
    })
    const community = read("community-pool", async () => {
      const dashboard = await fcd
      if (dashboard) {
        try {
          if (!isRecord(dashboard.communityPool) || Array.isArray(dashboard.communityPool)) throw new Error("Invalid source pool")
          return snapshotCoins(Object.entries(dashboard.communityPool).map(([denom, amount]) => ({ denom, amount })))
        } catch {
          sourceIssues.add("fcd-community-pool")
        }
      }
      const data = await lcd<{ pool?: SnapshotCoins }>("/cosmos/distribution/v1beta1/community_pool")
      return snapshotCoins(data?.pool)
    })
    const staking = read("staking-pool", async () => {
      const dashboard = await fcd
      const staked = snapshotUnit(dashboard?.stakingPool?.bondedTokens)
      if (staked !== undefined) return { staked, ratio: snapshotRatio(dashboard?.stakingPool?.stakingRatio) }
      const data = await lcd<{ pool?: { bonded_tokens?: string } }>("/cosmos/staking/v1beta1/pool")
      return { staked: requiredNumber(data?.pool?.bonded_tokens) / 1_000_000, ratio: undefined }
    })
    const blocks = read("latest-block", async () => {
      type Block = { block?: { header?: { height?: string; time?: string } } }
      const latest = await lcd<Block>("/cosmos/base/tendermint/v1beta1/blocks/latest")
      const height = requiredInteger(latest?.block?.header?.height, 1)
      const latestTime = Date.parse(latest?.block?.header?.time ?? "")
      // Never probe a fabricated previous height when latest failed.
      const previous = height > 1 ? await read("previous-block", () => lcd<Block>(`/cosmos/base/tendermint/v1beta1/blocks/${height - 1}`, 1_500)) : undefined
      const previousTime = Date.parse(previous?.block?.header?.time ?? "")
      const interval = Number.isFinite(latestTime) && Number.isFinite(previousTime) && latestTime >= previousTime ? latestTime - previousTime : undefined
      if (height > 1 && interval === undefined) sourceIssues.add("previous-block")
      return { height, interval }
    })
    const params = read("staking-params", async () => {
      const data = await lcd<{ params?: { max_validators?: string; unbonding_time?: string } }>("/cosmos/staking/v1beta1/params")
      const maxValidators = requiredInteger(data?.params?.max_validators)
      const duration = data?.params?.unbonding_time?.match(/^(\d+(?:\.\d+)?)s$/)
      if (!duration) throw new Error("Missing staking duration")
      return { maxValidators, unbondingTimeSec: Number(duration[1]) }
    })
    const validators = read("active-validators", async () => {
      const data = await lcd<{ pagination?: { total?: string } }>("/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=1&pagination.count_total=true")
      return requiredInteger(data?.pagination?.total)
    })
    const balances = (source: string, address: string) => read(source, async () => {
      const data = await lcd<{ balances?: SnapshotCoins }>(`/cosmos/bank/v1beta1/balances/${address}`)
      return snapshotCoins(data?.balances)
    })
    const circulating = (denom: "lunc" | "ustc") => !phoenix && typeof window === "undefined"
      ? read(`circulating-${denom}`, async () => requiredNumber(await currentJson<number | string>(`${CLASSICTERRA_BASE}/api/v1/csupply${denom === "ustc" ? "/ustc" : ""}`)))
      : Promise.resolve(undefined)
    const [luncSupply, ustcSupply, pool, stake, block, stakingParams, activeValidators, oracle, burned, rawLunc, rawUstc, inflation] = await Promise.all([
      supply("uluna"), phoenix ? Promise.resolve(undefined) : supply("uusd"), community, staking, blocks, params, validators,
      phoenix ? Promise.resolve(undefined) : balances("oracle-pool", ORACLE_POOL_ADDRESS),
      phoenix ? Promise.resolve(undefined) : balances("burn-address", BURN_ADDRESS), circulating("lunc"), circulating("ustc"),
      phoenix ? read("inflation", async () => requiredNumber((await lcd<{ inflation?: string }>("/cosmos/mint/v1beta1/inflation"))?.inflation)) : Promise.resolve(undefined)
    ])
    const circulatingLunc = rawLunc ?? (luncSupply !== undefined && pool && stake ? Math.max(0, luncSupply - pool.lunc - stake.staked) : undefined)
    const circulatingUstc = rawUstc ?? (ustcSupply !== undefined && pool ? Math.max(0, ustcSupply - pool.ustc) : undefined)
    const stakingRatio = stake?.ratio ?? (stake && luncSupply !== undefined && luncSupply > 0 ? snapshotRatio(stake.staked / luncSupply) : undefined)
    if (stake && stakingRatio === undefined) sourceIssues.add("staking-ratio")
    const now = Date.now()
    const snapshot: DashboardSnapshot = {
      timestamp: now, fetchedAt: now, stale: false,
      luncSupply, ustcSupply, luncCommunity: pool?.lunc, ustcCommunity: phoenix ? undefined : pool?.ustc,
      luncOracle: oracle?.lunc, ustcOracle: oracle?.ustc, luncBurned: burned?.lunc, ustcBurned: burned?.ustc,
      circulatingLunc, circulatingUstc, stakedLunc: stake?.staked,
      stakingRatio,
      activeValidators, maxValidators: stakingParams?.maxValidators, unbondingTimeSec: stakingParams?.unbondingTimeSec,
      blockHeight: block?.height, blockTimeMs: block?.interval, inflation,
      coverage: sourceIssues.size ? "partial" : "complete", sourceIssues: [...sourceIssues].sort()
    }
    if (![luncSupply, ustcSupply, pool, stake, block, stakingParams, activeValidators, oracle, burned, rawLunc, rawUstc, inflation].some(value => value !== undefined)) {
      throw new Error("Dashboard sources unavailable")
    }
    // Do not turn an outage into a 60-second healthy cache hit. Existing healthy
    // cache is never merged silently into a new partially unavailable snapshot.
    if (snapshot.coverage === "complete") setCachedSnapshot(cacheKey, snapshot)
    return snapshot
  })()
  currentSnapshotRequests.set(cacheKey, request)
  void request.finally(() => {
    if (currentSnapshotRequests.get(cacheKey) === request) currentSnapshotRequests.delete(cacheKey)
  }).catch(() => {})
  return request
}

export const fetchCurrentDashboardSnapshot = (): Promise<DashboardSnapshot> => fetchCurrentSnapshot(false)
export const fetchCurrentPhoenixDashboardSnapshot = (): Promise<DashboardSnapshot> => fetchCurrentSnapshot(true)

export const fetchHistoricalDashboardSnapshot = async (
  rangeKey: string,
  rangeMs: number,
  ttlMs: number
): Promise<DashboardSnapshot> => {
  const cacheKey = `${CLASSIC_CHAIN.chainId}:v2:historical:${rangeKey}`
  const cached = getCachedSnapshot(cacheKey, ttlMs)
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

  setCachedSnapshot(cacheKey, snapshot)
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
