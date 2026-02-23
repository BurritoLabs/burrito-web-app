import { CLASSIC_CHAIN } from "../chain"
import { queryContractSmart } from "./classic"
import { CLASSIC_SWAP_DEXES } from "./dexFactories"

const HEXXAGON_DEX_PAIRS_URL =
  "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main/cw20/dex_pairs/mainnet/terra.js"

type HexxagonDexPair = {
  token?: string
  dex?: string
  type?: string
  assets?: string[]
}

type PoolAssetInfo =
  | {
      native_token?: { denom?: string }
      token?: { contract_addr?: string }
      native?: string
      cw20?: string
    }
  | undefined

type PoolAsset = {
  amount?: string
  info?: PoolAssetInfo
}

type PoolResponse = {
  assets?: PoolAsset[]
}

export type MarketDexPair = {
  pair: string
  dexId: string
  dexLabel: string
  type: string
  assets: [string, string]
}

export type MarketPoolSnapshot = {
  pair: string
  dexId: string
  dexLabel: string
  type: string
  poolAssets: [
    { id: string; amount: string },
    { id: string; amount: string }
  ]
}

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

const normalizeDexName = (name: string) => name.toLowerCase().split("-")[0]

const ACTIVE_DEX_LABEL_BY_ID = new Map(
  CLASSIC_SWAP_DEXES.map((dex) => [dex.id.toLowerCase(), dex.label])
)

const ACTIVE_DEX_IDS = new Set(
  CLASSIC_SWAP_DEXES.map((dex) => normalizeDexName(dex.id))
)

const pickDexLabel = (dexId: string) => {
  const direct = ACTIVE_DEX_LABEL_BY_ID.get(dexId.toLowerCase())
  if (direct) return direct
  const normalized = dexId
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
  return normalized
}

const looksLikeTerraAddress = (value: string) => value.toLowerCase().startsWith("terra1")

const resolveAssetId = (info: PoolAssetInfo, fallback?: string) => {
  const nativeDenom =
    info?.native_token?.denom ??
    (typeof info?.native === "string" ? info.native : undefined)
  if (nativeDenom) return `native:${nativeDenom}`

  const cw20Contract =
    info?.token?.contract_addr ??
    (typeof info?.cw20 === "string" ? info.cw20 : undefined)
  if (cw20Contract) return `cw20:${cw20Contract.toLowerCase()}`

  if (fallback) {
    return looksLikeTerraAddress(fallback)
      ? `cw20:${fallback.toLowerCase()}`
      : `native:${fallback}`
  }
  return "native:unknown"
}

export const fetchMarketDexPairs = async (): Promise<MarketDexPair[]> => {
  const response = await fetch(HEXXAGON_DEX_PAIRS_URL)
  if (!response.ok) {
    throw new Error(`Failed to load DEX pairs: ${response.status}`)
  }

  const source = await response.text()
  const payload = parseCommonJsArray<HexxagonDexPair>(source)

  return payload
    .filter((item) => {
      if (!item?.token || !item?.dex || !item?.assets || item.assets.length < 2) {
        return false
      }
      const rootDex = normalizeDexName(item.dex)
      return ACTIVE_DEX_IDS.has(rootDex)
    })
    .map((item) => ({
      pair: item.token!,
      dexId: item.dex!.toLowerCase(),
      dexLabel: pickDexLabel(item.dex!),
      type: item.type ?? "xyk",
      assets: [item.assets![0], item.assets![1]]
    }))
}

const fetchPoolForPair = async (pair: MarketDexPair): Promise<MarketPoolSnapshot | null> => {
  try {
    const data = await queryContractSmart<PoolResponse>(pair.pair, { pool: {} })
    const assets = data?.assets
    if (!Array.isArray(assets) || assets.length < 2) return null

    const left = assets[0]
    const right = assets[1]
    const leftFallback = pair.assets[0]
    const rightFallback = pair.assets[1]

    return {
      pair: pair.pair,
      dexId: pair.dexId,
      dexLabel: pair.dexLabel,
      type: pair.type,
      poolAssets: [
        {
          id: resolveAssetId(left?.info, leftFallback),
          amount: left?.amount ?? "0"
        },
        {
          id: resolveAssetId(right?.info, rightFallback),
          amount: right?.amount ?? "0"
        }
      ]
    }
  } catch {
    return null
  }
}

export const fetchMarketPools = async (pairs: MarketDexPair[]) => {
  const snapshots: MarketPoolSnapshot[] = []
  const chunkSize = 8

  for (let index = 0; index < pairs.length; index += chunkSize) {
    const chunk = pairs.slice(index, index + chunkSize)
    const resolved = await Promise.all(chunk.map(fetchPoolForPair))
    resolved.forEach((item) => {
      if (item) snapshots.push(item)
    })
  }

  return snapshots
}

export const getMarketPoolIbcDenoms = (pairs: MarketDexPair[]) => {
  const denoms = new Set<string>()
  pairs.forEach((pair) => {
    pair.assets.forEach((asset) => {
      if (asset.startsWith("ibc/")) denoms.add(asset)
    })
  })
  return Array.from(denoms)
}

export const getMarketEndpointInfo = () => ({
  lcd: CLASSIC_CHAIN.lcd,
  chainId: CLASSIC_CHAIN.chainId
})
