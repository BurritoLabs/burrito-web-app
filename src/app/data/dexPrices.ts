import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { toBase64, toUtf8 } from "@cosmjs/encoding"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import { CLASSIC_SWAP_DEXES } from "./dexFactories"
import { ASSET_DEX_PAIRS_URL } from "../config/externalServices"
import { fetchWithEndpointFallback } from "./endpointFallback"
import { pickChainAssets } from "./terraAssets"

const PAIR_INDEX_TTL = 60 * 60 * 1000
const POOL_TTL = 2 * 60 * 1000

type RegistryDexPair = {
  token?: string
  dex?: string
  type?: string
  assets?: string[]
}

type PoolAsset = {
  info?: {
    cw20?: string
    native?: string
    native_token?: { denom?: string }
    token?: { contract_addr?: string }
  }
  amount?: string
}

type PoolResponse = {
  data?: {
    asset1?: {
      cw20?: string
      native?: string
    }
    asset2?: {
      cw20?: string
      native?: string
    }
    assets?: PoolAsset[]
    reserve1?: string
    reserve2?: string
  }
}

type CachedPairIndex = {
  ts: number
  chainId: string
  items: RegistryDexPair[]
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
const directFactoryPairCache = new Map<string, string | null>()

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
  const native = asset.info?.native_token?.denom ?? asset.info?.native
  if (native) return normalizeAssetKey(native)
  const cw20 = asset.info?.token?.contract_addr ?? asset.info?.cw20
  if (cw20) return normalizeAssetKey(cw20)
  return undefined
}

const toFactoryAssetInfo = (key: string) => {
  if (key.startsWith("terra1")) {
    return { token: { contract_addr: key } }
  }
  return { native_token: { denom: key } }
}

const toGarudaAssetInfo = (key: string) => {
  if (key.startsWith("terra1")) {
    return { cw20: key }
  }
  return { native: key }
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
  const chainId = CLASSIC_CHAIN.chainId
  if (
    pairIndexCache &&
    pairIndexCache.chainId === chainId &&
    Date.now() - pairIndexCache.ts < PAIR_INDEX_TTL
  ) {
    return pairIndexCache.items
  }
  const response = await fetch(ASSET_DEX_PAIRS_URL)
  if (!response.ok) {
    throw new Error(`Failed to load dex pairs: ${response.status}`)
  }
  const registry = (await response.json()) as Record<
    string,
    Record<string, Omit<RegistryDexPair, "token">>
  >
  const chainPairs = pickChainAssets(registry, CLASSIC_CHAIN.name, chainId) ?? {}
  const parsed = Object.entries(chainPairs)
    .map(([token, item]) => ({ ...item, token }))
    .filter(
      (item) =>
        Boolean(item.token) &&
        Array.isArray(item.assets) &&
        (item.assets?.length ?? 0) >= 2
    )
  pairIndexCache = { ts: Date.now(), chainId, items: parsed }
  return parsed
}

const fetchPairPool = async (pair: string) => {
  const cacheKey = `${CLASSIC_CHAIN.chainId}:${pair}`
  const cached = poolCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < POOL_TTL) {
    return cached.assets
  }
  const payload = encodeURIComponent(
    toBase64(toUtf8(JSON.stringify({ pool: {} })))
  )
  const url = `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${pair}/smart/${payload}`
  const response = await fetchWithEndpointFallback(url)
  if (!response.ok) return undefined
  const data = (await response.json()) as PoolResponse
  const assets =
    data?.data?.assets ??
    (data?.data?.asset1 && data?.data?.asset2
      ? [
          {
            info: data.data.asset1,
            amount: data.data.reserve1 ?? "0"
          },
          {
            info: data.data.asset2,
            amount: data.data.reserve2 ?? "0"
          }
        ]
      : undefined)
  if (!Array.isArray(assets) || !assets.length) return undefined
  poolCache.set(cacheKey, { ts: Date.now(), assets })
  return assets
}

const resolveDirectFactoryPair = async ({
  dexId,
  factory,
  mode,
  offerKey,
  askKey
}: {
  dexId: string
  factory?: string
  mode?: "terraswap" | "garuda" | "code-id" | "terrapump" | "luncpump" | "weso-defi"
  offerKey: string
  askKey: string
}) => {
  if (!factory || mode === "code-id") return undefined

  const cacheKey = `${dexId}:${factory}:${offerKey}:${askKey}`
  if (directFactoryPairCache.has(cacheKey)) {
    return directFactoryPairCache.get(cacheKey) ?? undefined
  }

  const query =
    mode === "garuda"
      ? {
          pair: {
            asset1: toGarudaAssetInfo(offerKey),
            asset2: toGarudaAssetInfo(askKey)
          }
        }
      : {
          pair: {
            asset_infos: [toFactoryAssetInfo(offerKey), toFactoryAssetInfo(askKey)]
          }
        }

  const payload = encodeURIComponent(toBase64(toUtf8(JSON.stringify(query))))
  const url = `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${factory}/smart/${payload}`

  try {
    const response = await fetchWithEndpointFallback(url)
    if (!response.ok) {
      directFactoryPairCache.set(cacheKey, null)
      return undefined
    }
    const data = (await response.json()) as {
      data?: { contract_addr?: string; contract?: string }
    }
    const pair = data?.data?.contract_addr ?? data?.data?.contract
    directFactoryPairCache.set(cacheKey, pair ?? null)
    return pair ?? undefined
  } catch {
    directFactoryPairCache.set(cacheKey, null)
    return undefined
  }
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

export const fetchDirectAnchorDexPrices = async (
  assetMetas: DexAssetMeta[]
): Promise<Record<string, DexEstimatedPrice>> => {
  if (CLASSIC_CHAIN.chainId !== "columbus-5") {
    return fetchDexEstimatedPrices(assetMetas)
  }
  const normalized = assetMetas
    .map((item) => ({
      key: normalizeAssetKey(item.key),
      decimals: Number.isFinite(item.decimals) ? item.decimals : 6
    }))
    .filter((item) => Boolean(item.key) && !ANCHORS.has(item.key))

  if (!normalized.length) return {}

  const decimalsMap = new Map<string, number>()
  normalized.forEach((item) => {
    if (!decimalsMap.has(item.key)) {
      decimalsMap.set(item.key, item.decimals)
    }
  })

  const bestMap = new Map<string, DexEstimatedPrice>()

  for (const { key } of normalized) {
    for (const anchorKey of ANCHORS) {
      const directQuotes = await Promise.all(
        CLASSIC_SWAP_DEXES.filter(
          (dex) =>
            dex.factory &&
            (!dex.mode || dex.mode === "terraswap" || dex.mode === "garuda")
        ).map(async (dex) => {
          const pair = await resolveDirectFactoryPair({
            dexId: dex.id,
            factory: dex.factory,
            mode: dex.mode,
            offerKey: key,
            askKey: anchorKey
          })
          if (!pair) return undefined

          const poolAssets = await fetchPairPool(pair)
          if (!poolAssets?.length) return undefined

          const reserves = new Map<string, bigint>()
          poolAssets.forEach((asset) => {
            const assetKey = parsePoolAssetKey(asset)
            if (!assetKey) return
            reserves.set(assetKey, parseBigInt(asset.amount))
          })

          const targetAmount = reserves.get(key)
          const anchorAmount = reserves.get(anchorKey)
          if (!targetAmount || !anchorAmount || targetAmount <= 0n || anchorAmount <= 0n) {
            return undefined
          }

          const targetDecimals = decimalsMap.get(key) ?? 6
          const targetUnits = toUnits(targetAmount, targetDecimals)
          const anchorUnits = toUnits(anchorAmount, 6)
          if (!Number.isFinite(targetUnits) || !Number.isFinite(anchorUnits)) return undefined
          if (targetUnits <= 0 || anchorUnits <= 0) return undefined

          const priceInQuote = anchorUnits / targetUnits
          if (!Number.isFinite(priceInQuote) || priceInQuote <= 0) return undefined

          return {
            quoteDenom:
              anchorKey === CLASSIC_DENOMS.ustc.coinMinimalDenom ? "uusd" : "uluna",
            priceInQuote,
            liquidityQuote: anchorUnits,
            pair,
            dex: dex.id
          } satisfies DexEstimatedPrice
        })
      )

      directQuotes.forEach((quote) => {
        if (!quote) return
        const current = bestMap.get(key)
        if (!current || quote.liquidityQuote > current.liquidityQuote) {
          bestMap.set(key, quote)
        }
      })
    }
  }

  return Object.fromEntries(bestMap)
}

export const useDexEstimatedPrices = (
  assetMetas: DexAssetMeta[],
  enabled = true
) => {
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
      CLASSIC_CHAIN.chainId,
      normalized.map((item) => `${item.key}:${item.decimals}`).join("|")
    ],
    queryFn: () => fetchDexEstimatedPrices(normalized),
    enabled: enabled && normalized.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000
  })
}

export const useDirectAnchorDexPrices = (
  assetMetas: DexAssetMeta[],
  enabled = true
) => {
  const normalized = useMemo(() => {
    const map = new Map<string, number>()
    assetMetas.forEach((item) => {
      const key = normalizeAssetKey(item.key)
      if (!key || map.has(key) || ANCHORS.has(key)) return
      map.set(key, Number.isFinite(item.decimals) ? item.decimals : 6)
    })
    return Array.from(map.entries())
      .map(([key, decimals]) => ({ key, decimals }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [assetMetas])

  return useQuery({
    queryKey: [
      "dex-direct-anchor-prices",
      CLASSIC_CHAIN.chainId,
      normalized.map((item) => `${item.key}:${item.decimals}`).join("|")
    ],
    queryFn: () => fetchDirectAnchorDexPrices(normalized),
    enabled: enabled && normalized.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000
  })
}
