import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { toBase64, toUtf8 } from "@cosmjs/encoding"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

const HEXXAGON_DEX_PAIRS_URL =
  "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main/cw20/dex_pairs/mainnet/terra.js"
const PAIR_INDEX_TTL = 60 * 60 * 1000
const POOL_TTL = 2 * 60 * 1000

type HexxagonDexPair = {
  token?: string
  dex?: string
  type?: string
  assets?: string[]
}

type PoolAsset = {
  info?: {
    native_token?: { denom?: string }
    token?: { contract_addr?: string }
  }
  amount?: string
}

type PoolResponse = {
  data?: {
    assets?: PoolAsset[]
  }
}

type CachedPairIndex = {
  ts: number
  items: HexxagonDexPair[]
}

type CachedPool = {
  ts: number
  assets: PoolAsset[]
}

export type DexAssetMeta = {
  key: string
  decimals: number
}

export type DexEstimatedPrice = {
  quoteDenom: "uusd" | "uluna"
  priceInQuote: number
  liquidityQuote: number
  pair: string
  dex?: string
}

const ANCHORS = new Set<string>([
  CLASSIC_DENOMS.ustc.coinMinimalDenom,
  CLASSIC_DENOMS.lunc.coinMinimalDenom
])

let pairIndexCache: CachedPairIndex | undefined
const poolCache = new Map<string, CachedPool>()

const parseCommonJsArray = <T,>(source: string): T[] => {
  const normalized = source.replace(/^\uFEFF/, "").trim()
  if (!/^module\.exports\s*=/.test(normalized)) {
    throw new Error("Unsupported hexxagon CJS format")
  }
  const expression = normalized
    .replace(/^module\.exports\s*=\s*/, "")
    .replace(/;\s*$/, "")
  // Trusted source payload from hexxagon chain-registry.
  const parsed = new Function(`return (${expression})`)() as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("Unsupported hexxagon CJS payload")
  }
  return parsed as T[]
}

const normalizeAssetKey = (key: string) => {
  if (!key) return key
  const trimmed = key.trim()
  if (trimmed.startsWith("terra1")) return trimmed.toLowerCase()
  if (trimmed.startsWith("ibc/")) {
    const hash = trimmed.slice(4).toUpperCase()
    return `ibc/${hash}`
  }
  return trimmed.toLowerCase()
}

const parsePoolAssetKey = (asset: PoolAsset) => {
  const native = asset.info?.native_token?.denom
  if (native) return normalizeAssetKey(native)
  const cw20 = asset.info?.token?.contract_addr
  if (cw20) return normalizeAssetKey(cw20)
  return undefined
}

const parseBigInt = (value: string | undefined) => {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

const toUnits = (amount: bigint, decimals: number) =>
  Number(amount) / 10 ** Math.max(0, decimals)

const fetchPairIndex = async () => {
  if (pairIndexCache && Date.now() - pairIndexCache.ts < PAIR_INDEX_TTL) {
    return pairIndexCache.items
  }
  const response = await fetch(HEXXAGON_DEX_PAIRS_URL)
  if (!response.ok) {
    throw new Error(`Failed to load dex pairs: ${response.status}`)
  }
  const source = await response.text()
  const parsed = parseCommonJsArray<HexxagonDexPair>(source).filter(
    (item) =>
      Boolean(item?.token) &&
      Array.isArray(item?.assets) &&
      (item.assets?.length ?? 0) >= 2
  )
  pairIndexCache = { ts: Date.now(), items: parsed }
  return parsed
}

const fetchPairPool = async (pair: string) => {
  const cached = poolCache.get(pair)
  if (cached && Date.now() - cached.ts < POOL_TTL) {
    return cached.assets
  }
  const payload = encodeURIComponent(
    toBase64(toUtf8(JSON.stringify({ pool: {} })))
  )
  const url = `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${pair}/smart/${payload}`
  const response = await fetch(url)
  if (!response.ok) return undefined
  const data = (await response.json()) as PoolResponse
  const assets = data?.data?.assets
  if (!Array.isArray(assets) || !assets.length) return undefined
  poolCache.set(pair, { ts: Date.now(), assets })
  return assets
}

export const fetchDexEstimatedPrices = async (
  assetMetas: DexAssetMeta[]
): Promise<Record<string, DexEstimatedPrice>> => {
  const normalized = assetMetas
    .map((item) => ({
      key: normalizeAssetKey(item.key),
      decimals: Number.isFinite(item.decimals) ? item.decimals : 6
    }))
    .filter((item) => Boolean(item.key))

  if (!normalized.length) return {}

  const decimalsMap = new Map<string, number>()
  normalized.forEach((item) => {
    if (!decimalsMap.has(item.key)) {
      decimalsMap.set(item.key, item.decimals)
    }
  })

  const targetKeys = new Set(
    normalized.map((item) => item.key).filter((key) => !ANCHORS.has(key))
  )
  if (!targetKeys.size) return {}

  const pairs = await fetchPairIndex()
  const candidatePairs = pairs.filter((pair) => {
    const assets = (pair.assets ?? []).map((key) => normalizeAssetKey(key))
    if (assets.length < 2) return false
    const hasTarget = assets.some((asset) => targetKeys.has(asset))
    const hasAnchor = assets.some((asset) => ANCHORS.has(asset))
    return hasTarget && hasAnchor
  })

  if (!candidatePairs.length) return {}

  const uniquePairAddresses = Array.from(
    new Set(candidatePairs.map((pair) => pair.token as string))
  )
  const poolEntries = await Promise.all(
    uniquePairAddresses.map(async (address) => {
      const assets = await fetchPairPool(address)
      return [address, assets] as const
    })
  )
  const validPoolEntries = poolEntries.filter(
    (entry): entry is readonly [string, PoolAsset[]] =>
      Array.isArray(entry[1]) && entry[1].length > 0
  )
  const poolMap = new Map<string, PoolAsset[]>(validPoolEntries)

  const bestMap = new Map<string, DexEstimatedPrice>()

  candidatePairs.forEach((pair) => {
    const pairAddress = pair.token as string
    const poolAssets = poolMap.get(pairAddress)
    if (!poolAssets?.length) return

    const reserves = new Map<string, bigint>()
    poolAssets.forEach((asset) => {
      const key = parsePoolAssetKey(asset)
      if (!key) return
      reserves.set(key, parseBigInt(asset.amount))
    })

    const pairAssets = (pair.assets ?? []).map((key) => normalizeAssetKey(key))
    const targetKey = pairAssets.find((key) => targetKeys.has(key))
    const anchorKey = pairAssets.find((key) => ANCHORS.has(key))
    if (!targetKey || !anchorKey) return

    const targetAmount = reserves.get(targetKey)
    const anchorAmount = reserves.get(anchorKey)
    if (!targetAmount || !anchorAmount || targetAmount <= 0n || anchorAmount <= 0n) {
      return
    }

    const targetDecimals = decimalsMap.get(targetKey) ?? 6
    const targetUnits = toUnits(targetAmount, targetDecimals)
    const anchorUnits = toUnits(anchorAmount, 6)
    if (!Number.isFinite(targetUnits) || !Number.isFinite(anchorUnits)) return
    if (targetUnits <= 0 || anchorUnits <= 0) return

    const priceInQuote = anchorUnits / targetUnits
    if (!Number.isFinite(priceInQuote) || priceInQuote <= 0) return

    const nextEntry: DexEstimatedPrice = {
      quoteDenom:
        anchorKey === CLASSIC_DENOMS.ustc.coinMinimalDenom ? "uusd" : "uluna",
      priceInQuote,
      liquidityQuote: anchorUnits,
      pair: pairAddress,
      dex: pair.dex
    }
    const current = bestMap.get(targetKey)
    if (!current || nextEntry.liquidityQuote > current.liquidityQuote) {
      bestMap.set(targetKey, nextEntry)
    }
  })

  return Object.fromEntries(bestMap)
}

export const useDexEstimatedPrices = (assetMetas: DexAssetMeta[]) => {
  const normalized = useMemo(() => {
    const map = new Map<string, number>()
    assetMetas.forEach((item) => {
      const key = normalizeAssetKey(item.key)
      if (!key || map.has(key)) return
      map.set(key, Number.isFinite(item.decimals) ? item.decimals : 6)
    })
    return Array.from(map.entries())
      .map(([key, decimals]) => ({ key, decimals }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [assetMetas])

  return useQuery({
    queryKey: [
      "dex-estimated-prices",
      normalized.map((item) => `${item.key}:${item.decimals}`).join("|")
    ],
    queryFn: () => fetchDexEstimatedPrices(normalized),
    enabled: normalized.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000
  })
}
