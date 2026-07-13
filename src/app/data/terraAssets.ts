import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"
import { getActiveAppChainKey } from "../activeChain"
import { sanitizeAssetIconUrl } from "../utils/assetIcons"
import { formatBaseDenomSymbol } from "../utils/assetIdentity"
import {
  ASSET_URL,
  COSMOS_SOURCE_ASSETLIST_URLS,
  COSMOS_TERRA_ASSETLIST_URL
} from "../config/externalServices"
import { fetchWithEndpointFallback } from "./endpointFallback"

export type Cw20Token = {
  protocol?: string
  symbol: string
  token: string
  icon?: string
  decimals?: number
  name?: string
}

export type IbcToken = {
  denom: string
  base_denom: string
  symbol: string
  name: string
  icon?: string
  decimals?: number
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

const IBC_CACHE_KEY = "burritoIbcTraceCacheV3"
const IBC_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const NATIVE_TOKEN_CACHE_KEY = "burritoNativeTokenCacheV2"
const NATIVE_TOKEN_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const CW20_TOKEN_INFO_CACHE_KEY = "burritoCw20TokenInfoCacheV2"
const CW20_TOKEN_INFO_CACHE_TTL = 24 * 60 * 60 * 1000
let ibcCache: Record<string, IbcCacheEntry> | null = null
let nativeTokenCache: Record<string, NativeTokenCacheEntry> | null = null
let cw20TokenInfoCache: Record<string, Cw20TokenInfoCacheEntry> | null = null
let cosmosRegistryAssetsPromise: Promise<CosmosRegistryAssets> | null = null
let cosmosSourceAssetAliasesPromise: Promise<Record<string, NativeToken>> | null = null

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
    window.localStorage.setItem(IBC_CACHE_KEY, JSON.stringify(next))
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
    window.localStorage.setItem(NATIVE_TOKEN_CACHE_KEY, JSON.stringify(next))
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
    window.localStorage.setItem(CW20_TOKEN_INFO_CACHE_KEY, JSON.stringify(next))
  } catch {
    // Ignore cache write failures.
  }
}

const getCachedIbcToken = (hash: string) => {
  const cache = readIbcCache()
  const cached = cache[hash]
  if (!cached) return undefined
  if (Date.now() - cached.ts > IBC_CACHE_TTL) {
    const next = { ...cache }
    delete next[hash]
    writeIbcCache(next)
    return undefined
  }
  return cached.token
}

const cacheIbcToken = (hash: string, token: IbcToken) => {
  const cache = readIbcCache()
  writeIbcCache({
    ...cache,
    [hash]: { ts: Date.now(), token }
  })
}

const getCachedNativeToken = (denom: string) => {
  const cache = readNativeTokenCache()
  const cached = cache[denom]
  if (!cached) return undefined
  if (Date.now() - cached.ts > NATIVE_TOKEN_CACHE_TTL) {
    const next = { ...cache }
    delete next[denom]
    writeNativeTokenCache(next)
    return undefined
  }
  return cached.token
}

const cacheNativeToken = (denom: string, token: NativeToken) => {
  const cache = readNativeTokenCache()
  writeNativeTokenCache({
    ...cache,
    [denom]: { ts: Date.now(), token }
  })
}

const getCachedCw20TokenInfo = (contract: string) => {
  const cache = readCw20TokenInfoCache()
  const cached = cache[contract]
  if (!cached) return undefined
  if (Date.now() - cached.ts > CW20_TOKEN_INFO_CACHE_TTL) {
    const next = { ...cache }
    delete next[contract]
    writeCw20TokenInfoCache(next)
    return undefined
  }
  return cached.token
}

const cacheCw20TokenInfo = (
  contract: string,
  token: { name?: string; symbol?: string; decimals?: number; icon?: string }
) => {
  const cache = readCw20TokenInfoCache()
  writeCw20TokenInfoCache({
    ...cache,
    [contract]: { ts: Date.now(), token }
  })
}

const looksLikeHttpUrl = (value?: string) =>
  Boolean(value && /^https?:\/\//i.test(value))

const mergeCw20TokenMetadata = ({
  contract,
  fallback,
  onChain
}: {
  contract: string
  fallback?: Cw20Token
  onChain?: { name?: string; symbol?: string; decimals?: number; icon?: string }
}): Cw20Token => {
  const localOverride = LOCAL_CW20_TOKEN_OVERRIDES[contract]
  const symbol =
    localOverride?.symbol?.trim() ||
    fallback?.symbol?.trim() ||
    onChain?.symbol?.trim() ||
    contract.slice(0, 6).toUpperCase()
  const name =
    localOverride?.name?.trim() ||
    fallback?.name?.trim() ||
    fallback?.symbol?.trim() ||
    onChain?.name?.trim() ||
    onChain?.symbol?.trim() ||
    contract
  return {
    token: contract,
    symbol,
    name,
    protocol: localOverride?.protocol?.trim() || fallback?.protocol?.trim(),
    icon: sanitizeAssetIconUrl(localOverride?.icon ?? fallback?.icon ?? onChain?.icon),
    decimals:
      localOverride?.decimals ??
      (Number.isFinite(onChain?.decimals) ? onChain?.decimals : (fallback?.decimals ?? 6))
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
  const symbol = candidate?.trim()
  if (
    !symbol ||
    symbol.length > 24 ||
    /^(?:ibc|factory)[/:]/i.test(symbol) ||
    /^0x[0-9a-f]{40}$/i.test(symbol)
  ) {
    return deriveSymbolFromDenom(denom)
  }
  return symbol
}

const resolveDisplayName = (candidate: string | undefined, symbol: string) => {
  const name = candidate?.trim()
  if (
    !name ||
    name.length > 64 ||
    /^(?:ibc|factory)[/:]/i.test(name) ||
    /^0x[0-9a-f]{40}$/i.test(name)
  ) {
    return symbol
  }
  return name
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
    const symbol = asset.symbol?.trim()
    if (!base || !symbol) return

    const name = asset.name?.trim() || symbol
    const decimals = getRegistryAssetDecimals(asset)
    const icon = sanitizeAssetIconUrl(asset.logo_URIs?.svg ?? asset.logo_URIs?.png)

    if (base.startsWith("cw20:terra1")) {
      const token = base.slice("cw20:".length).toLowerCase()
      result.cw20[token] = { token, symbol, name, decimals, icon }
      return
    }

    if (base.startsWith("ibc/")) {
      const hash = base.slice(4).toUpperCase()
      if (!hash) return
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
      const symbol = asset.symbol?.trim()
      if (!base || !symbol) return

      const token: NativeToken = {
        denom: base,
        symbol,
        name: asset.name?.trim() || symbol,
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

const fetchCosmosRegistryAssets = async () => {
  if (getActiveAppChainKey() !== "luna") return EMPTY_COSMOS_REGISTRY_ASSETS
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

const fetchCosmosSourceAssetAliases = async () => {
  if (getActiveAppChainKey() !== "luna") return {}
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

const fetchSourceRegistryToken = async (baseDenom: string) => {
  const aliases = await fetchCosmosSourceAssetAliases()
  return getBaseDenomLookupCandidates(baseDenom)
    .map((candidate) => aliases[candidate])
    .find(Boolean)
}

const fetchIbcTraceToken = async (hash: string): Promise<IbcToken | undefined> => {
  const cached = getCachedIbcToken(hash)
  if (cached) return cached

  const traceRes = await fetchWithEndpointFallback(
    `${CLASSIC_CHAIN.lcd}/ibc/apps/transfer/v1/denom_traces/${hash}`
  )
  if (!traceRes.ok) return undefined
  const tracePayload = (await traceRes.json()) as IbcTraceResponse
  const baseDenom = tracePayload?.denom_trace?.base_denom
  if (!baseDenom) return undefined

  const sourceToken = await fetchSourceRegistryToken(baseDenom)
  let metadata: BankMetadataResponse["metadata"] | undefined
  if (!sourceToken) {
    try {
      const metadataRes = await fetchWithEndpointFallback(
        `${CLASSIC_CHAIN.lcd}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(
          baseDenom
        )}`
      )
      if (metadataRes.ok) {
        const payload = (await metadataRes.json()) as BankMetadataResponse
        metadata = payload?.metadata
      }
    } catch {
      metadata = undefined
    }
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
    decimals: sourceToken?.decimals ?? getDecimalsFromMetadata(metadata) ?? 6,
    path: tracePayload?.denom_trace?.path
  }
  cacheIbcToken(hash, token)
  return token
}

const fetchNativeMetadataToken = async (
  denom: string
): Promise<NativeToken | undefined> => {
  const normalized = denom.trim().toLowerCase()
  if (!normalized || normalized.startsWith("ibc/") || normalized.startsWith("terra1")) {
    return undefined
  }

  const predefined =
    normalized === "uluna" && getActiveAppChainKey() === "luna"
      ? {
          denom: "uluna",
          symbol: "LUNA",
          name: "Terra",
          decimals: 6,
          icon: "/system/luna.svg"
        }
      : CLASSIC_NATIVE_DEFAULTS[normalized]
  if (predefined) return predefined

  const cached = getCachedNativeToken(normalized)
  if (cached) return cached

  const registryToken = (await fetchCosmosRegistryAssets()).native[normalized]
  if (registryToken) {
    cacheNativeToken(normalized, registryToken)
    return registryToken
  }

  const response = await fetchWithEndpointFallback(
    `${CLASSIC_CHAIN.lcd}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(normalized)}`
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
  cacheNativeToken(normalized, token)
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
  return useQuery({
    queryKey: ["terra-assets", "cw20", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, Cw20Token>>>(
        "cw20/tokens.json"
      )
      const tokens = pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      const mapped = Object.entries(tokens).reduce<Record<string, Cw20Token>>((acc, entry) => {
        const [key, token] = entry
        const address = (token.token || key).toLowerCase()
        const symbol = token.symbol?.trim()
        if (!address || !symbol) return acc

        const parsedDecimals = Number(token.decimals)
        acc[address] = {
          token: address,
          symbol,
          name: token.name?.trim() || symbol,
          protocol: token.protocol?.trim() || undefined,
          icon: sanitizeAssetIconUrl(token.icon),
          decimals: Number.isFinite(parsedDecimals) ? parsedDecimals : 6
        }
        return acc
      }, {})
      const supplemental = (await fetchCosmosRegistryAssets()).cw20
      return Object.fromEntries(
        Object.entries({ ...mapped, ...supplemental }).filter(([, token]) =>
          Boolean(token.symbol && token.token)
        )
      )
    },
    staleTime: 60 * 60 * 1000
  })
}

export const fetchCw20TokenInfos = async (
  contracts: string[],
  fallback: Record<string, Cw20Token> = {}
) => {
  const normalized = Array.from(
    new Set(contracts.map((contract) => contract.trim().toLowerCase()).filter(Boolean))
  )
  if (!normalized.length) return {}

  const results: Record<string, Cw20Token> = {}
  const missing: string[] = []

  normalized.forEach((contract) => {
    const cached = getCachedCw20TokenInfo(contract)
    if (cached) {
      results[contract] = mergeCw20TokenMetadata({
        contract,
        fallback: fallback[contract],
        onChain: cached
      })
      return
    }
    missing.push(contract)
  })

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
          `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`
        )
        if (!response.ok) continue
        const payload = (await response.json()) as Cw20TokenInfoResponse
        const info = payload.data
        const symbol = info?.symbol?.trim()
        const name = info?.name?.trim()
        const parsedDecimals = Number(info?.decimals)
        let icon: string | undefined
        try {
          const marketingQuery = btoa(JSON.stringify({ marketing_info: {} }))
          const marketingResponse = await fetchWithEndpointFallback(
            `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${marketingQuery}`
          )
          if (marketingResponse.ok) {
            const marketingPayload =
              (await marketingResponse.json()) as Cw20MarketingInfoResponse
            icon = extractCw20MarketingLogo(marketingPayload.data?.logo)
          }
        } catch {
          icon = undefined
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
        cacheCw20TokenInfo(contract, onChain)
        results[contract] = mergeCw20TokenMetadata({
          contract,
          fallback: fallback[contract],
          onChain
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
  const tokenQuery = useCw20Whitelist()
  const contractsQuery = useCw20Contracts()
  const base = useMemo(() => {
    const tokens = tokenQuery.data ?? {}
    const contractMeta = contractsQuery.data ?? {}
    const addresses = new Set([...Object.keys(tokens), ...Object.keys(contractMeta)])

    return Object.fromEntries(
      Array.from(addresses).map((address) => {
        const token = tokens[address]
        const contract = contractMeta[address]
        const fallbackSymbol = address.slice(0, 6).toUpperCase()

        return [
          address,
          {
            token: address,
            symbol:
              LOCAL_CW20_TOKEN_OVERRIDES[address]?.symbol ??
              token?.symbol ??
              contract?.name?.trim() ??
              fallbackSymbol,
            name:
              LOCAL_CW20_TOKEN_OVERRIDES[address]?.name?.trim() ||
              token?.name?.trim() ||
              contract?.name?.trim() ||
              token?.protocol?.trim() ||
              contract?.protocol?.trim() ||
              token?.symbol ||
              fallbackSymbol,
            protocol:
              LOCAL_CW20_TOKEN_OVERRIDES[address]?.protocol?.trim() ||
              token?.protocol?.trim() ||
              contract?.protocol?.trim() ||
              undefined,
            icon:
              LOCAL_CW20_TOKEN_OVERRIDES[address]?.icon ||
              token?.icon ||
              contract?.icon,
            decimals:
              LOCAL_CW20_TOKEN_OVERRIDES[address]?.decimals ??
              token?.decimals ??
              6
          } satisfies Cw20Token
        ]
      })
    )
  }, [contractsQuery.data, tokenQuery.data])
  const normalized = useMemo(
    () =>
      Array.from(
        new Set((contracts ?? []).map((contract) => contract.trim().toLowerCase()).filter(Boolean))
      ),
    [contracts]
  )

  const resolvedQuery = useQuery({
    queryKey: ["terra-assets", "cw20-resolved", CLASSIC_CHAIN.chainId, normalized.join(",")],
    queryFn: () => fetchCw20TokenInfos(normalized, base),
    enabled: normalized.length > 0,
    staleTime: 24 * 60 * 60 * 1000
  })

  const resolvedData = useMemo(() => {
    const combined = {
      ...base,
      ...(resolvedQuery.data ?? {})
    }

    if (!normalized.length) return combined

    return Object.fromEntries(
      normalized
        .map((contract) => [contract, combined[contract]])
        .filter((entry): entry is [string, Cw20Token] => Boolean(entry[1]))
    )
  }, [base, normalized, resolvedQuery.data])

  return {
    ...tokenQuery,
    data: resolvedData,
    isFetching: tokenQuery.isFetching || contractsQuery.isFetching || resolvedQuery.isFetching,
    isError: tokenQuery.isError || contractsQuery.isError || resolvedQuery.isError,
    error: (tokenQuery.error ?? contractsQuery.error ?? resolvedQuery.error) as Error | null
  }
}

export const useIbcWhitelist = () => {
  return useQuery({
    queryKey: ["terra-assets", "ibc", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, IbcToken>>>(
        "ibc/tokens.json"
      )
      const tokens =
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      const supplemental = (await fetchCosmosRegistryAssets()).ibc
      return { ...tokens, ...supplemental }
    },
    staleTime: 60 * 60 * 1000
  })
}

export const useResolvedIbcWhitelist = (denoms?: string[]) => {
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
    () => hashes.filter((hash) => !base[hash]),
    [base, hashes]
  )

  const resolvedQuery = useQuery({
    queryKey: [
      "terra-assets",
      "ibc-resolved",
      CLASSIC_CHAIN.chainId,
      missingHashes.join(",")
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        missingHashes.map(async (hash) => {
          const token = await fetchIbcTraceToken(hash)
          return token ? [hash, token] : undefined
        })
      )
      return Object.fromEntries(entries.filter(Boolean) as [string, IbcToken][])
    },
    enabled: missingHashes.length > 0,
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
      CLASSIC_CHAIN.chainId,
      normalized.join(",")
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        normalized.map(async (denom) => {
          const token = await fetchNativeMetadataToken(denom)
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
