import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"

const ASSET_URL = "https://assets.terra.dev"
const HEXXAGON_REGISTRY_URL = "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main"

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

type HexxagonCw20Token = {
  protocol?: string
  symbol?: string
  token?: string
  icon?: string
  decimals?: number | string
  name?: string
}

type HexxagonCw20Contract = {
  contract?: string
  protocol?: string
  name?: string
  icon?: string
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

type IbcCacheEntry = {
  ts: number
  token: IbcToken
}

const IBC_CACHE_KEY = "burritoIbcTraceCacheV1"
const IBC_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
let ibcCache: Record<string, IbcCacheEntry> | null = null

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

const looksLikeHttpUrl = (value?: string) =>
  Boolean(value && /^https?:\/\//i.test(value))

const deriveSymbolFromDenom = (denom?: string) => {
  if (!denom) return "IBC"
  if (denom === "uluna") return "LUNC"
  if (denom === "uusd") return "USTC"
  if (denom.startsWith("u")) {
    const base = denom.slice(1)
    if (base.length === 3) {
      return `${base.slice(0, 2).toUpperCase()}TC`
    }
    return base.toUpperCase()
  }
  const leaf = denom.split("/").pop() ?? denom
  return leaf.toUpperCase()
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

const fetchIbcTraceToken = async (hash: string): Promise<IbcToken | undefined> => {
  const cached = getCachedIbcToken(hash)
  if (cached) return cached

  const traceRes = await fetch(
    `${CLASSIC_CHAIN.lcd}/ibc/apps/transfer/v1/denom_traces/${hash}`
  )
  if (!traceRes.ok) return undefined
  const tracePayload = (await traceRes.json()) as IbcTraceResponse
  const baseDenom = tracePayload?.denom_trace?.base_denom
  if (!baseDenom) return undefined

  let metadata: BankMetadataResponse["metadata"] | undefined
  try {
    const metadataRes = await fetch(
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

  const symbol = metadata?.symbol?.trim() || deriveSymbolFromDenom(baseDenom)
  const name = metadata?.name?.trim() || symbol
  const token: IbcToken = {
    denom: `ibc/${hash}`,
    base_denom: baseDenom,
    symbol,
    name,
    icon: looksLikeHttpUrl(metadata?.uri) ? metadata?.uri : "/system/ibc.svg",
    decimals: getDecimalsFromMetadata(metadata) ?? 6,
    path: tracePayload?.denom_trace?.path
  }
  cacheIbcToken(hash, token)
  return token
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

const fetchHexxagonArray = async <T,>(path: string): Promise<T[]> => {
  const res = await fetch(`${HEXXAGON_REGISTRY_URL}/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}`)
  const source = await res.text()
  return parseCommonJsArray<T>(source)
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
  return (
    data.classic ??
    data["columbus-5"] ??
    data.mainnet ??
    data["phoenix-1"]
  )
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
      const hexxagonTokens = await fetchHexxagonArray<HexxagonCw20Token>(
        "cw20/tokens/mainnet/terra.js"
      )

      const mapped = hexxagonTokens.reduce<Record<string, Cw20Token>>((acc, token) => {
        const address = token.token?.toLowerCase()
        const symbol = token.symbol?.trim()
        if (!address || !symbol) return acc

        const parsedDecimals = Number(token.decimals)
        acc[address] = {
          token: address,
          symbol,
          name: token.name?.trim() || symbol,
          protocol: token.protocol?.trim() || undefined,
          icon: token.icon,
          decimals: Number.isFinite(parsedDecimals) ? parsedDecimals : 6
        }
        return acc
      }, {})
      return Object.fromEntries(
        Object.entries(mapped).filter(([, token]) => Boolean(token.symbol && token.token))
      )
    },
    staleTime: 60 * 60 * 1000
  })
}

export const useIbcWhitelist = () => {
  return useQuery({
    queryKey: ["terra-assets", "ibc", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, IbcToken>>>(
        "ibc/tokens.json"
      )
      return (
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      )
    },
    staleTime: 60 * 60 * 1000
  })
}

export const useResolvedIbcWhitelist = (denoms?: string[]) => {
  const baseQuery = useIbcWhitelist()
  const base = baseQuery.data ?? {}

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

  return {
    ...baseQuery,
    data: {
      ...base,
      ...(resolvedQuery.data ?? {})
    },
    isFetching: baseQuery.isFetching || resolvedQuery.isFetching,
    isError: baseQuery.isError || resolvedQuery.isError,
    error: (baseQuery.error ?? resolvedQuery.error) as Error | null
  }
}

export const useCw20Contracts = () => {
  return useQuery({
    queryKey: ["terra-assets", "cw20-contracts", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const hexxagonContracts = await fetchHexxagonArray<HexxagonCw20Contract>(
        "cw20/contracts/mainnet/terra.js"
      )

      return hexxagonContracts.reduce<Record<string, Cw20Contract>>((acc, contract) => {
        const address = contract.contract?.toLowerCase()
        if (!address) return acc
        acc[address] = {
          protocol: contract.protocol?.trim() || undefined,
          name: contract.name?.trim() || undefined,
          icon: contract.icon
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
