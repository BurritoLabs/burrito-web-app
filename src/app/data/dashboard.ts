import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

export type DashboardSnapshot = {
  timestamp: number
  height?: number
  luncSupply: number
  ustcSupply: number
  luncCommunity: number
  ustcCommunity: number
  circulatingLunc: number
  circulatingUstc: number
  stakedLunc: number
  stakingRatio: number
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
  txs?: Array<{ timestamp?: string }>
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
  const data = await fetchFcdDashboard()
  const issuances = data?.issuances ?? {}
  const pool = data?.communityPool ?? {}
  const luncSupply = toUnit(issuances[CLASSIC_DENOMS.lunc.coinMinimalDenom] ?? "0")
  const ustcSupply = toUnit(issuances[CLASSIC_DENOMS.ustc.coinMinimalDenom] ?? "0")
  const luncCommunity = sumCommunity(pool, CLASSIC_DENOMS.lunc.coinMinimalDenom)
  const ustcCommunity = sumCommunity(pool, CLASSIC_DENOMS.ustc.coinMinimalDenom)
  const stakedLunc = toUnit(data?.stakingPool?.bondedTokens ?? "0")
  const stakingRatio = toNumber(data?.stakingPool?.stakingRatio ?? "0")
  const [circulatingLuncRaw, circulatingUstcRaw] = await Promise.all([
    fetchClassicCirculatingSupply("lunc"),
    fetchClassicCirculatingSupply("ustc")
  ])
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
    circulatingLunc,
    circulatingUstc,
    stakedLunc,
    stakingRatio
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

  const [luncSupply, ustcSupply, community, stakedLunc, circulatingLuncRaw, circulatingUstcRaw] =
    await Promise.all([
    fetchSupplyByDenom(CLASSIC_DENOMS.lunc.coinMinimalDenom, height),
    fetchSupplyByDenom(CLASSIC_DENOMS.ustc.coinMinimalDenom, height),
    fetchCommunityPool(height),
    fetchStakingPoolAtHeight(height),
    fetchClassicCirculatingSupply("lunc", height),
    fetchClassicCirculatingSupply("ustc", height)
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
