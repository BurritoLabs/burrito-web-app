import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"
import { getActiveAppChainKey } from "../activeChain"
import { sanitizeAssetIconUrl } from "../utils/assetIcons"
import {
  formatBaseDenomSymbol,
  isSafeDisplaySymbol,
  isSafeNativeDenom,
  isTerraAddress,
  resolveSafeDisplayName,
  resolveSafeDisplaySymbol
} from "../utils/assetIdentity"
import {
  ASSET_URL,
  BURRITO_REGISTRY_API_URL,
  COSMOS_SOURCE_ASSETLIST_URLS,
  COSMOS_TERRA_ASSETLIST_URL
} from "../config/externalServices"
import { fetchWithEndpointFallback } from "./endpointFallback"
import { fetchVerifiedTokenRegistry } from "./tokenRegistry"
import { writeLocalStorageValue } from "../utils/safeStorage"

export type Cw20Token = {
  protocol?: string
  symbol: string
  token: string
  icon?: string
  decimals?: number
  decimalsVerified?: boolean
  name?: string
}

export type IbcToken = {
  denom: string
  base_denom: string
  symbol: string
  name: string
  icon?: string
  decimals?: number
  decimalsVerified?: boolean
  path?: string
}

export type NativeToken = {
  denom: string
  symbol: string
  name: string
  icon?: string
  decimals?: number
}

const LOCAL_CW20_TOKEN_OVERRIDES: Record<string, Partial<Cw20Token>> = {
  terra15p8su45k45axng8ue59rl6zph4at27s49u3agr6uqrx3dhcxpg3qt0ekdt: {
    symbol: "DO",
    name: "DO",
    protocol: "DO",
    icon: "/system/do-cookie.jpg"
  },
  terra1vhgq25vwuhdhn9xjll0rhl2s67jzw78a4g2t78y5kz89q9lsdskq2pxcj2: {
    symbol: "JURIS",
    name: "Juris Protocol",
    protocol: "Juris Protocol",
    // Optimized from JurisProtocol/assets/blob/main/jurislogo.png.
    icon: "/tokens/juris.webp"
  }
}

type IbcTraceResponse = {
  denom_trace?: {
    path?: string
    base_denom?: string
  }
}

type BankMetadataResponse = {
  metadata?: {
    base?: string
    display?: string
    name?: string
    symbol?: string
    uri?: string
    denom_units?: Array<{
      denom?: string
      exponent?: number
    }>
  }
}

type Cw20TokenInfoResponse = {
  data?: {
    name?: string
    symbol?: string
    decimals?: number | string
  }
}

type Cw20MarketingLogo = { url?: string } | { embedded?: unknown } | null

type Cw20MarketingInfoResponse = {
  data?: {
    project?: string
    description?: string
    marketing?: string
    logo?: Cw20MarketingLogo
  }
}

type IbcCacheEntry = {
  ts: number
  token: IbcToken
}

type Cw20TokenInfoCacheEntry = {
  ts: number
  verified?: boolean
  token: {
    name?: string
    symbol?: string
    decimals?: number
    icon?: string
  }
}

type NativeTokenCacheEntry = {
  ts: number
  token: NativeToken
}

type CosmosRegistryAsset = {
  base?: string
  display?: string
  name?: string
  symbol?: string
  denom_units?: Array<{
    denom?: string
    exponent?: number
  }>
  logo_URIs?: {
    png?: string
    svg?: string
  }
  traces?: Array<{
    chain?: { channel_id?: string; path?: string }
    counterparty?: { base_denom?: string }
  }>
}

type CosmosRegistryAssetList = {
  assets?: CosmosRegistryAsset[]
}

export type CosmosRegistryAssets = {
  cw20: Record<string, Cw20Token>
  ibc: Record<string, IbcToken>
  native: Record<string, NativeToken>
}

const EMPTY_COSMOS_REGISTRY_ASSETS: CosmosRegistryAssets = {
  cw20: {},
  ibc: {},
  native: {}
}

const IBC_CACHE_KEY = "burritoIbcTraceCacheV4"
const IBC_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const IBC_UNRESOLVED_CACHE_TTL = 5 * 60 * 1000
const NATIVE_TOKEN_CACHE_KEY = "burritoNativeTokenCacheV2"
const NATIVE_TOKEN_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const CW20_TOKEN_INFO_CACHE_KEY = "burritoCw20TokenInfoCacheV2"
const CW20_TOKEN_INFO_CACHE_TTL = 24 * 60 * 60 * 1000
let ibcCache: Record<string, IbcCacheEntry> | null = null
let nativeTokenCache: Record<string, NativeTokenCacheEntry> | null = null
let cw20TokenInfoCache: Record<string, Cw20TokenInfoCacheEntry> | null = null
let cosmosRegistryAssetsPromise: Promise<CosmosRegistryAssets> | null = null
let cosmosSourceAssetAliasesPromise: Promise<Record<string, NativeToken>> | null = null

export const buildChainScopedAssetCacheKey = (
  chainId: string,
  assetId: string
) => `${chainId}:${assetId.trim().toLowerCase()}`

type AssetChainScope = {
  chainId: string
  chainKey: ReturnType<typeof getActiveAppChainKey>
  lcd: string
  name: string
}

const getAssetChainScope = (): AssetChainScope => ({
  chainId: CLASSIC_CHAIN.chainId,
  chainKey: getActiveAppChainKey(),
  lcd: CLASSIC_CHAIN.lcd,
  name: CLASSIC_CHAIN.name
})

export const fetchAsset = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${ASSET_URL}/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}`)
  return res.json() as Promise<T>
}

const readIbcCache = () => {
  if (ibcCache) return ibcCache
  if (typeof window === "undefined") {
    ibcCache = {}
    return ibcCache
  }
  try {
    const raw = window.localStorage.getItem(IBC_CACHE_KEY)
    if (!raw) {
      ibcCache = {}
      return ibcCache
    }
    const parsed = JSON.parse(raw) as Record<string, IbcCacheEntry>
    ibcCache = parsed && typeof parsed === "object" ? parsed : {}
    return ibcCache
  } catch {
    ibcCache = {}
    return ibcCache
  }
}

const writeIbcCache = (next: Record<string, IbcCacheEntry>) => {
  ibcCache = next
  if (typeof window === "undefined") return
  try {
    writeLocalStorageValue(IBC_CACHE_KEY, JSON.stringify(next))
  } catch {
    // Ignore cache write failures.
  }
}

const readNativeTokenCache = () => {
  if (nativeTokenCache) return nativeTokenCache
  if (typeof window === "undefined") {
    nativeTokenCache = {}
    return nativeTokenCache
  }
  try {
    const raw = window.localStorage.getItem(NATIVE_TOKEN_CACHE_KEY)
    if (!raw) {
      nativeTokenCache = {}
      return nativeTokenCache
    }
    const parsed = JSON.parse(raw) as Record<string, NativeTokenCacheEntry>
    nativeTokenCache = parsed && typeof parsed === "object" ? parsed : {}
    return nativeTokenCache
  } catch {
    nativeTokenCache = {}
    return nativeTokenCache
  }
}

const writeNativeTokenCache = (next: Record<string, NativeTokenCacheEntry>) => {
  nativeTokenCache = next
  if (typeof window === "undefined") return
  try {
    writeLocalStorageValue(NATIVE_TOKEN_CACHE_KEY, JSON.stringify(next))
  } catch {
    // Ignore cache write failures.
  }
}

const readCw20TokenInfoCache = () => {
  if (cw20TokenInfoCache) return cw20TokenInfoCache
  if (typeof window === "undefined") {
    cw20TokenInfoCache = {}
    return cw20TokenInfoCache
  }
  try {
    const raw = window.localStorage.getItem(CW20_TOKEN_INFO_CACHE_KEY)
    if (!raw) {
      cw20TokenInfoCache = {}
      return cw20TokenInfoCache
    }
    const parsed = JSON.parse(raw) as Record<string, Cw20TokenInfoCacheEntry>
    cw20TokenInfoCache = parsed && typeof parsed === "object" ? parsed : {}
    return cw20TokenInfoCache
  } catch {
    cw20TokenInfoCache = {}
    return cw20TokenInfoCache
  }
}

const writeCw20TokenInfoCache = (
  next: Record<string, Cw20TokenInfoCacheEntry>
) => {
  cw20TokenInfoCache = next
  if (typeof window === "undefined") return
  try {
    writeLocalStorageValue(CW20_TOKEN_INFO_CACHE_KEY, JSON.stringify(next))
  } catch {
    // Ignore cache write failures.
  }
}

const getCachedIbcToken = (hash: string, chainId: string) => {
  const cache = readIbcCache()
  const key = buildChainScopedAssetCacheKey(chainId, hash)
  const cached = cache[key]
  if (!cached) return undefined
  if (
    !cached.token ||
    typeof cached.token.symbol !== "string" ||
    typeof cached.ts !== "number"
  ) {
    const next = { ...cache }
    delete next[key]
    writeIbcCache(next)
    return undefined
  }
  const cacheTtl = cached.token.symbol.toUpperCase() === "IBC"
    ? IBC_UNRESOLVED_CACHE_TTL
    : IBC_CACHE_TTL
  if (Date.now() - cached.ts > cacheTtl) {
    const next = { ...cache }
    delete next[key]
    writeIbcCache(next)
    return undefined
  }
  return cached.token
}

const cacheIbcToken = (hash: string, token: IbcToken, chainId: string) => {
  const cache = readIbcCache()
  const key = buildChainScopedAssetCacheKey(chainId, hash)
  writeIbcCache({
    ...cache,
    [key]: { ts: Date.now(), token }
  })
}

const getCachedNativeToken = (denom: string, chainId: string) => {
  const cache = readNativeTokenCache()
  const key = buildChainScopedAssetCacheKey(chainId, denom)
  const cached = cache[key]
  if (!cached) return undefined
  if (Date.now() - cached.ts > NATIVE_TOKEN_CACHE_TTL) {
    const next = { ...cache }
    delete next[key]
    writeNativeTokenCache(next)
    return undefined
  }
  return cached.token
}

const cacheNativeToken = (
  denom: string,
  token: NativeToken,
  chainId: string
) => {
  const cache = readNativeTokenCache()
  const key = buildChainScopedAssetCacheKey(chainId, denom)
  writeNativeTokenCache({
    ...cache,
    [key]: { ts: Date.now(), token }
  })
}

const getCachedCw20TokenInfo = (contract: string, chainId: string) => {
  const cache = readCw20TokenInfoCache()
  const key = buildChainScopedAssetCacheKey(chainId, contract)
  const cached = cache[key]
  if (!cached) return undefined
  if (cached.verified !== true) return undefined
  if (Date.now() - cached.ts > CW20_TOKEN_INFO_CACHE_TTL) {
    const next = { ...cache }
    delete next[key]
    writeCw20TokenInfoCache(next)
    return undefined
  }
  return cached.token
}

const cacheCw20TokenInfo = (
  contract: string,
  token: { name?: string; symbol?: string; decimals?: number; icon?: string },
  chainId: string
) => {
  if (!Number.isInteger(token.decimals)) return
  const cache = readCw20TokenInfoCache()
  const key = buildChainScopedAssetCacheKey(chainId, contract)
  writeCw20TokenInfoCache({
    ...cache,
    [key]: { ts: Date.now(), verified: true, token }
  })
}

const getLocalCw20TokenOverride = (
  contract: string,
  chainKey = getActiveAppChainKey()
) =>
  chainKey === "lunc"
    ? LOCAL_CW20_TOKEN_OVERRIDES[contract]
    : undefined

const looksLikeHttpUrl = (value?: string) =>
  Boolean(value && /^https?:\/\//i.test(value))

type FinderAssetMetadataResponse = {
  cw20?: Array<{
    contract?: string
    status?: string
    metadata?: { name?: string; symbol?: string; decimals?: number; icon?: string }
  }>
  ibc?: Array<{
    hash?: string
    status?: string
    metadata?: {
      denom?: string
      path?: string
      baseDenom?: string
      symbol?: string
      name?: string
      icon?: string
      decimals?: number
    }
  }>
}

export const isResolvedIbcMetadata = (metadata?: {
  symbol?: string
  name?: string
}) => {
  const symbol = metadata?.symbol?.trim().toUpperCase()
  const name = metadata?.name?.trim().toUpperCase()
  return Boolean(symbol && symbol !== "IBC" && name !== "IBC")
}

const fetchFinderAssetMetadata = async ({
  contracts = [],
  ibcDenoms = [],
  chainKey
}: {
  contracts?: string[]
  ibcDenoms?: string[]
  chainKey: ReturnType<typeof getActiveAppChainKey>
}) => {
  if (!BURRITO_REGISTRY_API_URL) return undefined
  try {
    const response = await fetch(`${BURRITO_REGISTRY_API_URL}/v1/finder/account-assets`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        network: chainKey === "lunc" ? "classic" : "mainnet",
        contracts: contracts.slice(0, 500),
        ibcDenoms: ibcDenoms.slice(0, 100)
      })
    })
    if (!response.ok) throw new Error(`Finder assets returned HTTP ${response.status}`)
    return (await response.json()) as FinderAssetMetadataResponse
  } catch {
    return undefined
  }
}

const hasReliableCw20Fallback = (
  contract: string,
  fallback?: Cw20Token
) => {
  const symbol = fallback?.symbol?.trim()
  if (!symbol || !isSafeDisplaySymbol(symbol)) return false
  return symbol.toUpperCase() !== contract.slice(0, 6).toUpperCase()
}

const mergeCw20TokenMetadata = ({
  contract,
  fallback,
  onChain,
  chainKey = getActiveAppChainKey()
}: {
  contract: string
  fallback?: Cw20Token
  onChain?: { name?: string; symbol?: string; decimals?: number; icon?: string }
  chainKey?: ReturnType<typeof getActiveAppChainKey>
}): Cw20Token => {
  const localOverride = getLocalCw20TokenOverride(contract, chainKey)
  const reliableFallback = hasReliableCw20Fallback(contract, fallback)
  const fallbackSymbol = `CW20-${contract.slice(6, 12).toUpperCase()}`
  const symbolCandidate =
    localOverride?.symbol?.trim() ||
    (reliableFallback ? fallback?.symbol?.trim() : undefined) ||
    onChain?.symbol?.trim() ||
    fallback?.symbol?.trim()
  const symbol = resolveSafeDisplaySymbol(symbolCandidate, fallbackSymbol)
  const nameCandidate =
    localOverride?.name?.trim() ||
    (reliableFallback ? fallback?.name?.trim() : undefined) ||
    (reliableFallback ? fallback?.symbol?.trim() : undefined) ||
    onChain?.name?.trim() ||
    onChain?.symbol?.trim() ||
    fallback?.name?.trim() ||
    fallback?.symbol?.trim()
  const name = resolveSafeDisplayName(nameCandidate, symbol)
  return {
    token: contract,
    symbol,
    name,
    protocol: localOverride?.protocol?.trim() || fallback?.protocol?.trim(),
    icon: sanitizeAssetIconUrl(localOverride?.icon ?? fallback?.icon ?? onChain?.icon),
    decimals:
      (Number.isFinite(onChain?.decimals)
        ? onChain?.decimals
        : (localOverride?.decimals ?? fallback?.decimals ?? 6)),
    decimalsVerified: Number.isInteger(onChain?.decimals)
  }
}

const extractCw20MarketingLogo = (logo?: Cw20MarketingLogo) => {
  if (!logo || typeof logo !== "object" || !("url" in logo)) return undefined
  return sanitizeAssetIconUrl(logo.url)
}

const deriveSymbolFromDenom = (denom?: string) => {
  if (!denom) return "IBC"
  if (denom === "uluna") return getActiveAppChainKey() === "lunc" ? "LUNC" : "LUNA"
  if (denom === "uusd") return "USTC"
  return formatBaseDenomSymbol(denom) || "IBC"
}

const resolveDisplaySymbol = (candidate: string | undefined, denom: string) => {
  const fallback = deriveSymbolFromDenom(denom)
  const symbol = resolveSafeDisplaySymbol(candidate, fallback)
  return /^(?:ibc|factory)[/:]/i.test(symbol) || /^0x[0-9a-f]{40}$/i.test(symbol)
    ? fallback
    : symbol
}

const resolveDisplayName = (candidate: string | undefined, symbol: string) => {
  const name = resolveSafeDisplayName(candidate, symbol)
  return /^(?:ibc|factory)[/:]/i.test(name) || /^0x[0-9a-f]{40}$/i.test(name)
    ? symbol
    : name
}

const CLASSIC_NATIVE_DEFAULTS: Record<string, NativeToken> = {
  uluna: {
    denom: "uluna",
    symbol: "LUNC",
    name: "Terra Classic",
    decimals: 6,
    icon: "/system/lunc.svg"
  },
  uusd: {
    denom: "uusd",
    symbol: "USTC",
    name: "TerraClassicUSD",
    decimals: 6,
    icon: "/system/ustc.png"
  }
}

const getDecimalsFromMetadata = (metadata?: BankMetadataResponse["metadata"]) => {
  if (!metadata?.denom_units?.length) return undefined
  const display = metadata.display
  const displayUnit = metadata.denom_units.find((unit) => unit.denom === display)
  if (displayUnit && Number.isFinite(displayUnit.exponent)) {
    return Number(displayUnit.exponent)
  }
  const nonZero = metadata.denom_units.find(
    (unit) => Number.isFinite(unit.exponent) && Number(unit.exponent) > 0
  )
  if (nonZero && Number.isFinite(nonZero.exponent)) {
    return Number(nonZero.exponent)
  }
  return undefined
}

const getRegistryAssetDecimals = (asset: CosmosRegistryAsset) => {
  const displayUnit = asset.denom_units?.find((unit) => unit.denom === asset.display)
  if (Number.isFinite(displayUnit?.exponent)) return Number(displayUnit?.exponent)
  const exponents = (asset.denom_units ?? [])
    .map((unit) => Number(unit.exponent))
    .filter((exponent) => Number.isFinite(exponent) && exponent >= 0)
  return exponents.length ? Math.max(...exponents) : 6
}

export const mapCosmosRegistryAssets = (
  payload: CosmosRegistryAssetList
): CosmosRegistryAssets => {
  const result: CosmosRegistryAssets = { cw20: {}, ibc: {}, native: {} }

  ;(payload.assets ?? []).forEach((asset) => {
    const base = asset.base?.trim()
    if (!base) return
    const symbol = resolveDisplaySymbol(asset.symbol, base)

    const name = resolveDisplayName(asset.name, symbol)
    const decimals = getRegistryAssetDecimals(asset)
    const icon = sanitizeAssetIconUrl(asset.logo_URIs?.svg ?? asset.logo_URIs?.png)

    if (base.startsWith("cw20:terra1")) {
      const token = base.slice("cw20:".length).toLowerCase()
      if (!isTerraAddress(token)) return
      result.cw20[token] = { token, symbol, name, decimals, icon }
      return
    }

    if (base.startsWith("ibc/")) {
      const hash = base.slice(4).toUpperCase()
      if (!/^[A-F0-9]{64}$/.test(hash)) return
      const trace = asset.traces?.[0]
      result.ibc[hash] = {
        denom: `ibc/${hash}`,
        base_denom: trace?.counterparty?.base_denom?.trim() || base,
        symbol,
        name,
        decimals,
        icon,
        path: trace?.chain?.channel_id
          ? `transfer/${trace.chain.channel_id}`
          : undefined
      }
      return
    }

    if (!isSafeNativeDenom(base)) return
    const denom = base.toLowerCase()
    result.native[denom] = { denom, symbol, name, decimals, icon }
  })

  return result
}

export const mapCosmosRegistryAssetAliases = (
  payloads: CosmosRegistryAssetList[]
) => {
  const aliases: Record<string, NativeToken> = {}

  payloads.forEach((payload) => {
    ;(payload.assets ?? []).forEach((asset) => {
      const base = asset.base?.trim()
      if (!base || !isSafeNativeDenom(base)) return
      const symbol = resolveDisplaySymbol(asset.symbol, base)

      const token: NativeToken = {
        denom: base,
        symbol,
        name: resolveDisplayName(asset.name, symbol),
        decimals: getRegistryAssetDecimals(asset),
        icon: sanitizeAssetIconUrl(asset.logo_URIs?.svg ?? asset.logo_URIs?.png)
      }
      const keys = new Set([
        base,
        ...(asset.denom_units ?? []).map((unit) => unit.denom ?? ""),
        ...(asset.traces ?? []).flatMap((trace) => [
          trace.counterparty?.base_denom ?? "",
          trace.chain?.path ?? ""
        ])
      ])
      keys.forEach((key) => {
        const normalized = key.trim().toLowerCase()
        if (normalized && !aliases[normalized]) aliases[normalized] = token
      })
    })
  })

  return aliases
}

const fetchCosmosRegistryAssets = async (
  chainKey = getActiveAppChainKey()
) => {
  if (chainKey !== "luna") return EMPTY_COSMOS_REGISTRY_ASSETS
  if (!cosmosRegistryAssetsPromise) {
    cosmosRegistryAssetsPromise = fetch(COSMOS_TERRA_ASSETLIST_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load Terra asset list: ${response.status}`)
        return mapCosmosRegistryAssets((await response.json()) as CosmosRegistryAssetList)
      })
      .catch(() => EMPTY_COSMOS_REGISTRY_ASSETS)
  }
  return cosmosRegistryAssetsPromise
}

const fetchCosmosSourceAssetAliases = async (
  chainKey = getActiveAppChainKey()
) => {
  if (chainKey !== "luna") return {}
  if (!cosmosSourceAssetAliasesPromise) {
    cosmosSourceAssetAliasesPromise = Promise.all(
      COSMOS_SOURCE_ASSETLIST_URLS.map(async (url) => {
        try {
          const response = await fetch(url)
          if (!response.ok) return { assets: [] }
          return (await response.json()) as CosmosRegistryAssetList
        } catch {
          return { assets: [] }
        }
      })
    ).then(mapCosmosRegistryAssetAliases)
  }
  return cosmosSourceAssetAliasesPromise
}

const getBaseDenomLookupCandidates = (baseDenom: string) => {
  const candidates = new Set<string>()
  let current = baseDenom.trim().toLowerCase()
  if (!current) return []
  candidates.add(current)

  while (current.startsWith("transfer/")) {
    const segments = current.split("/")
    if (segments.length < 3) break
    current = segments.slice(2).join("/")
    candidates.add(current)
  }

  const leaf = current.split("/").at(-1)
  if (leaf) candidates.add(leaf)
  return Array.from(candidates)
}

const fetchSourceRegistryToken = async (
  baseDenom: string,
  chainKey = getActiveAppChainKey()
) => {
  const aliases = await fetchCosmosSourceAssetAliases(chainKey)
  return getBaseDenomLookupCandidates(baseDenom)
    .map((candidate) => aliases[candidate])
    .find(Boolean)
}

const fetchIbcTraceToken = async (
  hash: string,
  scope = getAssetChainScope()
): Promise<IbcToken | undefined> => {
  const { chainId, chainKey, lcd } = scope
  const cached = getCachedIbcToken(hash, chainId)
  if (cached?.decimalsVerified) return cached

  const traceRes = await fetchWithEndpointFallback(
    `${lcd}/ibc/apps/transfer/v1/denom_traces/${hash}`
  )
  if (!traceRes.ok) return undefined
  const tracePayload = (await traceRes.json()) as IbcTraceResponse
  const baseDenom = tracePayload?.denom_trace?.base_denom
  if (!baseDenom) return undefined

  const sourceToken = await fetchSourceRegistryToken(baseDenom, chainKey)
  let metadata: BankMetadataResponse["metadata"] | undefined
  try {
    const metadataRes = await fetchWithEndpointFallback(
      `${lcd}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(baseDenom)}`
    )
    if (metadataRes.ok) {
      const payload = (await metadataRes.json()) as BankMetadataResponse
      metadata = payload?.metadata
    }
  } catch {
    metadata = undefined
  }

  const symbol = resolveDisplaySymbol(sourceToken?.symbol ?? metadata?.symbol, baseDenom)
  const name = resolveDisplayName(sourceToken?.name ?? metadata?.name, symbol)
  const token: IbcToken = {
    denom: `ibc/${hash}`,
    base_denom: baseDenom,
    symbol,
    name,
    icon:
      sourceToken?.icon ??
      (looksLikeHttpUrl(metadata?.uri)
        ? sanitizeAssetIconUrl(metadata?.uri) ?? "/system/ibc.svg"
        : "/system/ibc.svg"),
    decimals: getDecimalsFromMetadata(metadata) ?? sourceToken?.decimals ?? 6,
    decimalsVerified: getDecimalsFromMetadata(metadata) !== undefined,
    path: tracePayload?.denom_trace?.path
  }
  cacheIbcToken(hash, token, chainId)
  return token
}

const fetchNativeMetadataToken = async (
  denom: string,
  scope = getAssetChainScope()
): Promise<NativeToken | undefined> => {
  const normalized = denom.trim().toLowerCase()
  if (!normalized || normalized.startsWith("ibc/") || normalized.startsWith("terra1")) {
    return undefined
  }

  const { chainId, chainKey, lcd } = scope
  const predefined =
    normalized === "uluna" && chainKey === "luna"
      ? {
          denom: "uluna",
          symbol: "LUNA",
          name: "Terra",
          decimals: 6,
          icon: "/system/luna.svg"
        }
      : CLASSIC_NATIVE_DEFAULTS[normalized]
  if (predefined) return predefined

  const cached = getCachedNativeToken(normalized, chainId)
  if (cached) return cached

  const registryToken = (await fetchCosmosRegistryAssets(chainKey)).native[
    normalized
  ]
  if (registryToken) {
    cacheNativeToken(normalized, registryToken, chainId)
    return registryToken
  }

  const response = await fetchWithEndpointFallback(
    `${lcd}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(normalized)}`
  )
  if (!response.ok) return undefined
  const payload = (await response.json()) as BankMetadataResponse
  const metadata = payload?.metadata
  if (!metadata) return undefined

  const symbol = resolveDisplaySymbol(metadata.symbol, normalized)
  const name = resolveDisplayName(metadata.name, symbol)
  const token: NativeToken = {
    denom: normalized,
    symbol,
    name,
    decimals: getDecimalsFromMetadata(metadata) ?? 6,
    icon: undefined
  }
  cacheNativeToken(normalized, token, chainId)
  return token
}

export const pickChainAssets = <T,>(
  data: Record<string, T> | undefined,
  name: string,
  chainId: string
) => {
  if (!data) return undefined
  if (data[name]) return data[name]
  if (data[chainId]) return data[chainId]
  const loweredName = name.toLowerCase()
  const loweredChain = chainId.toLowerCase()
  const match = Object.keys(data).find(
    (key) => key.toLowerCase() === loweredName || key.toLowerCase() === loweredChain
  )
  if (match) return data[match]

  if (loweredChain === "columbus-5") {
    return data.classic ?? data["columbus-5"]
  }
  if (loweredChain === "phoenix-1") {
    return data.mainnet ?? data["phoenix-1"]
  }
  return data.mainnet ?? data.classic
}

export type Cw20Contract = {
  protocol?: string
  name?: string
  icon?: string
}

export const useCw20Whitelist = () => {
  const scope = getAssetChainScope()
  return useQuery({
    queryKey: ["terra-assets", "cw20", scope.chainId],
    queryFn: async () => {
      const [data, verified] = await Promise.all([
        fetchAsset<Record<string, Record<string, Cw20Token>>>("cw20/tokens.json"),
        fetchVerifiedTokenRegistry(scope.chainKey)
      ])
      const tokens = pickChainAssets(data, scope.name, scope.chainId) ?? {}
      const mapped = Object.entries(tokens).reduce<Record<string, Cw20Token>>((acc, entry) => {
        const [key, token] = entry
        const address = (token.token || key).toLowerCase()
        if (!isTerraAddress(address)) return acc
        const fallbackSymbol = `CW20-${address.slice(6, 12).toUpperCase()}`
        const symbol = resolveSafeDisplaySymbol(token.symbol, fallbackSymbol)

        const parsedDecimals = Number(token.decimals)
        acc[address] = {
          token: address,
          symbol,
          name: resolveSafeDisplayName(token.name, symbol),
          protocol: token.protocol?.trim() || undefined,
          icon: sanitizeAssetIconUrl(token.icon),
          decimals: Number.isFinite(parsedDecimals) ? parsedDecimals : 6
        }
        return acc
      }, {})
      const supplemental = (await fetchCosmosRegistryAssets(scope.chainKey)).cw20
      return Object.fromEntries(
        Object.entries({ ...mapped, ...supplemental, ...verified.cw20 }).filter(([, token]) =>
          Boolean(token.symbol && token.token)
        )
      )
    },
    staleTime: 60 * 60 * 1000
  })
}

const fetchFinderCw20TokenInfos = async (
  contracts: string[],
  fallback: Record<string, Cw20Token>,
  scope: AssetChainScope
) => {
  const payload = await fetchFinderAssetMetadata({
    contracts,
    chainKey: scope.chainKey
  })
  if (!payload) return {}

  return (payload.cw20 ?? []).reduce<Record<string, Cw20Token>>((result, entry) => {
    const contract = entry.contract?.trim().toLowerCase()
    if (!contract || !isTerraAddress(contract) || entry.status !== "ok") return result
    const metadata = entry.metadata
    if (!metadata) return result
    result[contract] = mergeCw20TokenMetadata({
      contract,
      fallback: {
        ...fallback[contract],
        token: contract,
        symbol: metadata.symbol ?? fallback[contract]?.symbol ?? "",
        name: metadata.name ?? fallback[contract]?.name,
        icon: metadata.icon ?? fallback[contract]?.icon,
        decimals: Number.isInteger(metadata.decimals)
          ? metadata.decimals
          : fallback[contract]?.decimals
      },
      chainKey: scope.chainKey
    })
    return result
  }, {})
}

export const fetchCw20TokenInfos = async (
  contracts: string[],
  fallback: Record<string, Cw20Token> = {},
  scope = getAssetChainScope(),
  options: { skipFinder?: boolean } = {}
) => {
  const normalized = Array.from(
    new Set(
      contracts
        .map((contract) => contract.trim().toLowerCase())
        .filter(isTerraAddress)
    )
  )
  if (!normalized.length) return {}

  const results: Record<string, Cw20Token> = {}
  const missing: string[] = []
  const fallbackWithFinder: Record<string, Cw20Token> = { ...fallback }

  normalized.forEach((contract) => {
    const cached = getCachedCw20TokenInfo(contract, scope.chainId)
    if (cached) {
      results[contract] = mergeCw20TokenMetadata({
        contract,
        fallback: fallback[contract],
        onChain: cached,
        chainKey: scope.chainKey
      })
      return
    }
    missing.push(contract)
  })

  if (!options.skipFinder) {
    const finderTokens = await fetchFinderCw20TokenInfos(missing, fallback, scope)
    Object.assign(fallbackWithFinder, finderTokens)
    Object.assign(results, finderTokens)
  }

  let index = 0
  const concurrency = 8

  const workers = Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
    while (index < missing.length) {
      const current = index
      index += 1
      const contract = missing[current]
      try {
        const query = btoa(JSON.stringify({ token_info: {} }))
        const response = await fetchWithEndpointFallback(
          `${scope.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`
        )
        if (!response.ok) continue
        const payload = (await response.json()) as Cw20TokenInfoResponse
        const info = payload.data
        const symbol = info?.symbol?.trim()
        const name = info?.name?.trim()
        const parsedDecimals = Number(info?.decimals)
        let icon: string | undefined
        if (!fallbackWithFinder[contract]?.icon) {
          try {
            const marketingQuery = btoa(JSON.stringify({ marketing_info: {} }))
            const marketingResponse = await fetchWithEndpointFallback(
              `${scope.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${marketingQuery}`
            )
            if (marketingResponse.ok) {
              const marketingPayload =
                (await marketingResponse.json()) as Cw20MarketingInfoResponse
              icon = extractCw20MarketingLogo(marketingPayload.data?.logo)
            }
          } catch {
            icon = undefined
          }
        }
        const onChain = {
          symbol: symbol || undefined,
          name: name || undefined,
          decimals: Number.isFinite(parsedDecimals) ? parsedDecimals : undefined,
          icon
        }
        if (
          !onChain.symbol &&
          !onChain.name &&
          onChain.decimals === undefined &&
          !onChain.icon
        ) {
          continue
        }
        cacheCw20TokenInfo(contract, onChain, scope.chainId)
        results[contract] = mergeCw20TokenMetadata({
          contract,
          fallback: fallbackWithFinder[contract],
          onChain,
          chainKey: scope.chainKey
        })
      } catch {
        // Ignore per-contract metadata failures.
      }
    }
  })

  await Promise.all(workers)
  return results
}

export const useResolvedCw20Whitelist = (contracts?: string[]) => {
  const scope = getAssetChainScope()
  const tokenQuery = useCw20Whitelist()
  const contractsQuery = useCw20Contracts()
  const base = useMemo(() => {
    const tokens = tokenQuery.data ?? {}
    const contractMeta = contractsQuery.data ?? {}
    const addresses = new Set([...Object.keys(tokens), ...Object.keys(contractMeta)])

    return Object.fromEntries(
      Array.from(addresses).filter(isTerraAddress).map((address) => {
        const token = tokens[address]
        const contract = contractMeta[address]
        return [
          address,
          mergeCw20TokenMetadata({
            contract: address,
            fallback: {
              token: address,
              symbol: token?.symbol ?? contract?.name ?? "",
              name: token?.name ?? contract?.name,
              protocol: token?.protocol ?? contract?.protocol,
              icon: token?.icon ?? contract?.icon,
              decimals: token?.decimals ?? 6
            },
            chainKey: scope.chainKey
          })
        ]
      })
    )
  }, [contractsQuery.data, scope.chainKey, tokenQuery.data])
  const normalized = useMemo(
    () =>
      Array.from(
        new Set((contracts ?? []).map((contract) => contract.trim().toLowerCase()).filter(Boolean))
      ),
    [contracts]
  )

  const finderQuery = useQuery({
    queryKey: ["terra-assets", "cw20-finder", scope.chainId, normalized.join(",")],
    queryFn: () => fetchFinderCw20TokenInfos(normalized, base, scope),
    enabled: normalized.length > 0,
    staleTime: 5 * 60 * 1000
  })

  const verificationBase = useMemo(
    () => ({ ...base, ...(finderQuery.data ?? {}) }),
    [base, finderQuery.data]
  )

  const resolvedQuery = useQuery({
    queryKey: ["terra-assets", "cw20-verified", scope.chainId, normalized.join(",")],
    queryFn: () =>
      fetchCw20TokenInfos(normalized, verificationBase, scope, { skipFinder: true }),
    enabled: normalized.length > 0 && finderQuery.isFetched,
    staleTime: 24 * 60 * 60 * 1000
  })

  const resolvedData = useMemo(() => {
    const combined = {
      ...base,
      ...(finderQuery.data ?? {}),
      ...(resolvedQuery.data ?? {})
    }

    if (!normalized.length) return combined

    return Object.fromEntries(
      normalized
        .map((contract) => [contract, combined[contract]])
        .filter((entry): entry is [string, Cw20Token] => Boolean(entry[1]))
    )
  }, [base, finderQuery.data, normalized, resolvedQuery.data])

  return {
    ...tokenQuery,
    data: resolvedData,
    isFetching:
      tokenQuery.isFetching ||
      contractsQuery.isFetching ||
      finderQuery.isFetching ||
      resolvedQuery.isFetching,
    isError:
      tokenQuery.isError ||
      contractsQuery.isError ||
      finderQuery.isError ||
      resolvedQuery.isError,
    error: (tokenQuery.error ??
      contractsQuery.error ??
      finderQuery.error ??
      resolvedQuery.error) as Error | null
  }
}

export const useIbcWhitelist = () => {
  const scope = getAssetChainScope()
  return useQuery({
    queryKey: ["terra-assets", "ibc", scope.chainId],
    queryFn: async () => {
      const [data, verified] = await Promise.all([
        fetchAsset<Record<string, Record<string, IbcToken>>>("ibc/tokens.json"),
        fetchVerifiedTokenRegistry(scope.chainKey)
      ])
      const tokens =
        pickChainAssets(data, scope.name, scope.chainId) ?? {}
      const supplemental = (await fetchCosmosRegistryAssets(scope.chainKey)).ibc
      return { ...tokens, ...supplemental, ...verified.ibc }
    },
    staleTime: 60 * 60 * 1000
  })
}

export const useResolvedIbcWhitelist = (denoms?: string[]) => {
  const scope = getAssetChainScope()
  const baseQuery = useIbcWhitelist()
  const base = useMemo(() => baseQuery.data ?? {}, [baseQuery.data])

  const hashes = useMemo(() => {
    const set = new Set<string>()
    ;(denoms ?? []).forEach((denom) => {
      if (!denom?.startsWith("ibc/")) return
      const hash = denom.slice(4).toUpperCase()
      if (hash) set.add(hash)
    })
    return Array.from(set)
  }, [denoms])

  const missingHashes = useMemo(
    () => hashes.filter((hash) => !base[hash] || !base[hash].decimalsVerified),
    [base, hashes]
  )

  const resolvedQuery = useQuery({
    queryKey: [
      "terra-assets",
      "ibc-resolved",
      scope.chainId,
      missingHashes.join(",")
    ],
    queryFn: async () => {
      const finderPayload = await fetchFinderAssetMetadata({
        ibcDenoms: missingHashes.map((hash) => `ibc/${hash}`),
        chainKey: scope.chainKey
      })
      const finderEntries = (finderPayload?.ibc ?? []).flatMap((entry) => {
          const hash = entry.hash?.trim().toUpperCase()
          const metadata = entry.metadata
          if (
            !hash ||
            !/^[A-F0-9]{64}$/.test(hash) ||
            entry.status !== "ok" ||
            !metadata ||
            !isResolvedIbcMetadata(metadata)
          ) {
            return []
          }
          const symbol = resolveDisplaySymbol(metadata.symbol, metadata.baseDenom ?? "")
          const token: IbcToken = {
            denom: `ibc/${hash}`,
            base_denom: metadata.baseDenom ?? `ibc/${hash}`,
            symbol,
            name: resolveDisplayName(metadata.name, symbol),
            icon: sanitizeAssetIconUrl(metadata.icon) ?? "/system/ibc.svg",
            decimals: Number.isInteger(metadata.decimals) ? metadata.decimals : 6,
            path: metadata.path
          }
          return [[hash, token] as [string, IbcToken]]
        })
      const finderTokens = Object.fromEntries(finderEntries)
      const unresolvedHashes = missingHashes

      const entries = await Promise.all(
        unresolvedHashes.map(async (hash) => {
          const token = await fetchIbcTraceToken(hash, scope)
          return token ? [hash, token] : undefined
        })
      )
      return {
        ...finderTokens,
        ...Object.fromEntries(entries.filter(Boolean) as [string, IbcToken][])
      }
    },
    enabled: missingHashes.length > 0 && baseQuery.isFetched,
    staleTime: 24 * 60 * 60 * 1000
  })

  const resolvedData = useMemo(
    () => ({
      ...base,
      ...(resolvedQuery.data ?? {})
    }),
    [base, resolvedQuery.data]
  )

  return {
    ...baseQuery,
    data: resolvedData,
    isFetching: baseQuery.isFetching || resolvedQuery.isFetching,
    isError: baseQuery.isError || resolvedQuery.isError,
    error: (baseQuery.error ?? resolvedQuery.error) as Error | null
  }
}

export const useResolvedNativeWhitelist = (denoms?: string[]) => {
  const scope = getAssetChainScope()
  const normalized = useMemo(
    () =>
      Array.from(
        new Set(
          (denoms ?? [])
            .map((denom) => denom.trim().toLowerCase())
            .filter(
              (denom) =>
                Boolean(denom) && !denom.startsWith("ibc/") && !denom.startsWith("terra1")
            )
        )
      ),
    [denoms]
  )

  return useQuery({
    queryKey: [
      "terra-assets",
      "native-resolved",
      scope.chainId,
      normalized.join(",")
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        normalized.map(async (denom) => {
          const token = await fetchNativeMetadataToken(denom, scope)
          return token ? [denom, token] : undefined
        })
      )
      return Object.fromEntries(entries.filter(Boolean) as [string, NativeToken][])
    },
    enabled: normalized.length > 0,
    staleTime: 24 * 60 * 60 * 1000
  })
}

export const useCw20Contracts = () => {
  return useQuery({
    queryKey: ["terra-assets", "cw20-contracts", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, Cw20Contract>>>(
        "cw20/contracts.json"
      )
      const contracts =
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      return Object.entries(contracts).reduce<Record<string, Cw20Contract>>((acc, entry) => {
        const [key, contract] = entry
        const address = key.toLowerCase()
        if (!address) return acc
        acc[address] = {
          protocol: contract.protocol?.trim() || undefined,
          name: contract.name?.trim() || undefined,
          icon: sanitizeAssetIconUrl(contract.icon)
        }
        return acc
      }, {})
    },
    staleTime: 60 * 60 * 1000
  })
}

export type ValidatorLogoEntry = {
  name?: string
  identity?: string
  website?: string
  icon?: string
  image?: string
  logo?: string
}

export const useValidatorWhitelist = () => {
  return useQuery({
    queryKey: ["terra-assets", "validator-logos", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, ValidatorLogoEntry>>>(
        "validators/validators.json"
      )
      return (
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      )
    },
    staleTime: 60 * 60 * 1000
  })
}
