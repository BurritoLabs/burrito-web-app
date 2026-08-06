import type { AppChainKey } from "../appChains"
import { ASSET_URL } from "../config/externalServices"
import {
  readLocalStorageValue,
  writeLocalStorageValue
} from "../utils/safeStorage"
import { fetchWithEndpointFallback } from "./endpointFallback"

const NFT_REGISTRY_URL = `${ASSET_URL}/cw721/contracts.json`
const COLLECTION_QUERY_CONCURRENCY = 6
const NFT_INFO_QUERY_CONCURRENCY = 8
const TOKENS_PAGE_SIZE = 50
const MAX_TOKENS_PER_COLLECTION = 250
const MAX_OWNED_NFTS = 400
const MAX_DISCOVERED_CONTRACTS = 32
const NFT_COLLECTION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const NFT_COLLECTION_CACHE_LIMIT = 160
const DEFAULT_NFT_IMAGE = "/system/nft.svg"
const IPFS_IMAGE_GATEWAYS = [
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/"
] as const

type UnknownRecord = Record<string, unknown>

type NftRegistryEntry = {
  contract?: string
  name?: string
  symbol?: string
  icon?: string
  homepage?: string
  marketplace?: string[]
}

type NftRegistryResponse = {
  classic?: Record<string, NftRegistryEntry>
  mainnet?: Record<string, NftRegistryEntry>
}

type TokenEntry = {
  tokenId: string
  tokenUri?: string
}

export type NftAttribute = {
  traitType: string
  value: string
}

export type NftCollection = {
  contract: string
  name: string
  symbol?: string
  icon?: string
  homepage?: string
  marketplace: string[]
}

export type OwnedNft = {
  contract: string
  tokenId: string
  tokenUri?: string
  name?: string
  description?: string
  image?: string
  animationUrl?: string
  externalUrl?: string
  attributes: NftAttribute[]
  collectionName: string
  collectionSymbol?: string
  collectionIcon?: string
  collectionHomepage?: string
  collectionMarketplace: string[]
}

export type OwnedNftResult = {
  items: OwnedNft[]
  collectionCount: number
  scannedCollections: number
  failedCollections: number
  discoveredCollections: number
  truncated: boolean
}

export type NftMetadata = {
  name?: string
  description?: string
  image?: string
  animationUrl?: string
  externalUrl?: string
  attributes: NftAttribute[]
}

type CachedNftCollections = {
  updatedAt: number
  collections: NftCollection[]
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const readRecordString = (record: UnknownRecord | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const value = readString(record?.[key])
    if (value) return value
  }
  return undefined
}

export const isTerraAddress = (value: string) =>
  /^terra1[0-9a-z]{20,90}$/.test(value)

export const buildNftTransferExecuteMsg = ({
  recipient,
  tokenId
}: {
  recipient: string
  tokenId: string
}) => ({
  transfer_nft: {
    recipient: recipient.trim().toLowerCase(),
    token_id: tokenId
  }
})

const normalizeIpfsPath = (value: string) => {
  const path = value.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "")
  return path ? `https://ipfs.io/ipfs/${path}` : undefined
}

export const normalizeNftUri = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > 4_096) return undefined
  if (/^ipfs:\/\//i.test(trimmed)) return normalizeIpfsPath(trimmed)
  if (/^ar:\/\//i.test(trimmed)) {
    const path = trimmed.replace(/^ar:\/\//i, "")
    return path ? `https://arweave.net/${path}` : undefined
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^data:application\/json[;,]/i.test(trimmed) && trimmed.length <= 256_000) {
    return trimmed
  }
  return undefined
}

export const buildNftImageCandidates = (value?: string) => {
  const normalized = normalizeNftUri(value)
  if (!normalized || normalized.startsWith("data:application/")) return []

  const ipfsPath =
    normalized.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/i)?.[1] ??
    value?.trim().match(/^ipfs:\/\/(.+)$/i)?.[1]

  if (!ipfsPath) return [normalized]

  return IPFS_IMAGE_GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`)
}

export const buildNftMetadataCandidates = (value?: string) => {
  const normalized = normalizeNftUri(value)
  if (!normalized) return []
  if (normalized.startsWith("data:application/")) return [normalized]

  const ipfsPath =
    normalized.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/i)?.[1] ??
    value?.trim().match(/^ipfs:\/\/(.+)$/i)?.[1]

  return ipfsPath
    ? IPFS_IMAGE_GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`)
    : [normalized]
}

const normalizeNftImage = (value?: string) => {
  const normalized = normalizeNftUri(value)
  if (!normalized || normalized.startsWith("data:application/")) return undefined
  return normalized
}

const encodeSmartQuery = (query: Record<string, unknown>) => {
  const bytes = new TextEncoder().encode(JSON.stringify(query))
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const queryContractSmartAt = async <T>({
  address,
  lcd,
  query
}: {
  address: string
  lcd: string
  query: Record<string, unknown>
}) => {
  const payload = encodeSmartQuery(query)
  const response = await fetchWithEndpointFallback(
    `${lcd}/cosmwasm/wasm/v1/contract/${address}/smart/${payload}`,
    { timeoutMs: 8_000 }
  )
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = undefined
  }
  if (!response.ok) {
    const record = isRecord(parsed) ? parsed : undefined
    throw new Error(
      readRecordString(record, "message", "error", "details") ??
        `CW721 query failed: ${response.status}`
    )
  }
  const record = isRecord(parsed) ? parsed : undefined
  return ((record?.data as T | undefined) ?? parsed) as T
}

const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) => {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await worker(items[index], index)
      }
    }
  )
  await Promise.all(runners)
  return results
}

export const mapNftRegistry = (
  data: NftRegistryResponse,
  chainKey: AppChainKey
) => {
  const registry = chainKey === "lunc" ? data.classic : data.mainnet
  if (!registry) return []

  return Object.entries(registry).flatMap(([key, entry]) => {
    const contract = readString(entry.contract) ?? key.trim()
    if (!isTerraAddress(contract)) return []
    return [
      {
        contract,
        name: readString(entry.name) ?? readString(entry.symbol) ?? "NFT Collection",
        symbol: readString(entry.symbol),
        icon: normalizeNftImage(entry.icon),
        homepage: normalizeNftUri(entry.homepage),
        marketplace: Array.isArray(entry.marketplace)
          ? entry.marketplace.flatMap((url) => normalizeNftUri(url) ?? [])
          : []
      } satisfies NftCollection
    ]
  })
}

export const mergeNftCollections = (
  ...collectionGroups: readonly (readonly NftCollection[])[]
) => {
  const merged = new Map<string, NftCollection>()
  collectionGroups.flat().forEach((collection) => {
    if (!isTerraAddress(collection.contract)) return
    const existing = merged.get(collection.contract)
    merged.set(collection.contract, {
      contract: collection.contract,
      name:
        existing?.name && existing.name !== "NFT Collection"
          ? existing.name
          : collection.name,
      symbol: existing?.symbol ?? collection.symbol,
      icon: existing?.icon ?? collection.icon,
      homepage: existing?.homepage ?? collection.homepage,
      marketplace: Array.from(
        new Set([...(existing?.marketplace ?? []), ...collection.marketplace])
      )
    })
  })
  return Array.from(merged.values())
}

const getNftCollectionCacheKey = (chainKey: AppChainKey) =>
  `burrito:nft-collections:v1:${chainKey}`

export const parseCachedNftCollections = (
  value: string | null,
  now = Date.now()
) => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as CachedNftCollections
    if (
      !Number.isFinite(parsed.updatedAt) ||
      now - parsed.updatedAt > NFT_COLLECTION_CACHE_TTL_MS ||
      !Array.isArray(parsed.collections)
    ) {
      return []
    }
    return parsed.collections
      .filter(
        (collection) =>
          isTerraAddress(collection.contract) &&
          typeof collection.name === "string" &&
          Array.isArray(collection.marketplace)
      )
      .slice(0, NFT_COLLECTION_CACHE_LIMIT)
  } catch {
    return []
  }
}

export const loadCachedNftCollections = (chainKey: AppChainKey) =>
  parseCachedNftCollections(
    readLocalStorageValue(getNftCollectionCacheKey(chainKey))
  )

export const rememberNftCollections = (
  chainKey: AppChainKey,
  collections: readonly NftCollection[]
) => {
  const next = mergeNftCollections(
    loadCachedNftCollections(chainKey),
    collections
  ).slice(0, NFT_COLLECTION_CACHE_LIMIT)
  writeLocalStorageValue(
    getNftCollectionCacheKey(chainKey),
    JSON.stringify({ updatedAt: Date.now(), collections: next })
  )
  return next
}

export const fetchNftCollections = async (chainKey: AppChainKey) => {
  const response = await fetch(NFT_REGISTRY_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000)
  })
  if (!response.ok) {
    throw new Error(`NFT registry returned HTTP ${response.status}`)
  }
  return mapNftRegistry((await response.json()) as NftRegistryResponse, chainKey)
}

const parseCollectionInfo = (value: unknown, contract: string): NftCollection => {
  const record = isRecord(value) ? value : undefined
  const name = readRecordString(record, "name")
  const symbol = readRecordString(record, "symbol")
  if (!name && !symbol) throw new Error("Contract is not a compatible CW721 collection")
  return {
    contract,
    name: name ?? symbol ?? "NFT Collection",
    symbol,
    marketplace: []
  }
}

export const fetchNftCollection = async ({
  contract,
  lcd
}: {
  contract: string
  lcd: string
}) => {
  const normalizedContract = contract.trim().toLowerCase()
  if (!isTerraAddress(normalizedContract)) {
    throw new Error("Enter a valid Terra CW721 contract address")
  }
  const response = await queryContractSmartAt<unknown>({
    address: normalizedContract,
    lcd,
    query: { contract_info: {} }
  })
  return parseCollectionInfo(response, normalizedContract)
}

const collectContractAddresses = (value: unknown, output: Set<string>) => {
  if (output.size >= MAX_DISCOVERED_CONTRACTS) return
  if (Array.isArray(value)) {
    value.forEach((entry) => collectContractAddresses(entry, output))
    return
  }
  if (!isRecord(value)) return
  const attributeKey = readString(value.key)
  const attributeValue = readString(value.value)
  if (
    attributeKey &&
    attributeValue &&
    ["contract", "contract_address", "_contract_address"].includes(
      attributeKey
    ) &&
    isTerraAddress(attributeValue)
  ) {
    output.add(attributeValue)
  }
  Object.entries(value).forEach(([key, entry]) => {
    if (
      typeof entry === "string" &&
      ["contract", "contract_address", "_contract_address"].includes(key) &&
      isTerraAddress(entry)
    ) {
      output.add(entry)
    } else if (typeof entry === "object" && entry !== null) {
      collectContractAddresses(entry, output)
    }
  })
}

export const extractNftContractCandidates = (value: unknown) => {
  const output = new Set<string>()
  collectContractAddresses(value, output)
  return Array.from(output).slice(0, MAX_DISCOVERED_CONTRACTS)
}

const fetchNftContractCandidates = async ({
  lcd,
  owner
}: {
  lcd: string
  owner: string
}) => {
  const events = [
    "message.sender",
    "transfer.recipient",
    "wasm.owner",
    "wasm.recipient"
  ] as const
  const responses = await mapWithConcurrency(events, 2, async (event) => {
    const url = new URL(`${lcd.replace(/\/$/, "")}/cosmos/tx/v1beta1/txs`)
    url.searchParams.set("events", `${event}='${owner}'`)
    url.searchParams.set("pagination.limit", "25")
    url.searchParams.set("order_by", "ORDER_BY_DESC")
    try {
      const response = await fetchWithEndpointFallback(url, { timeoutMs: 6_000 })
      return response.ok ? ((await response.json()) as unknown) : undefined
    } catch {
      return undefined
    }
  })
  const candidates = new Set<string>()
  responses.forEach((response) => {
    extractNftContractCandidates(response).forEach((contract) =>
      candidates.add(contract)
    )
  })
  return Array.from(candidates).slice(0, MAX_DISCOVERED_CONTRACTS)
}

export const extractNftTokenEntries = (value: unknown): TokenEntry[] => {
  const record = isRecord(value) ? value : undefined
  const candidates = Array.isArray(record?.tokens)
    ? record.tokens
    : Array.isArray(record?.ids)
      ? record.ids
      : []

  return candidates.flatMap((candidate) => {
    if (typeof candidate === "string" || typeof candidate === "number") {
      const tokenId = String(candidate).trim()
      return tokenId ? [{ tokenId }] : []
    }
    if (!isRecord(candidate)) return []
    const tokenId = readRecordString(candidate, "token_id", "tokenId", "id")
    if (!tokenId) return []
    return [
      {
        tokenId,
        tokenUri: readRecordString(
          candidate,
          "token_uri",
          "tokenUri",
          "metadata_uri",
          "metadataUri"
        )
      }
    ]
  })
}

const fetchCollectionTokenEntries = async ({
  collection,
  lcd,
  owner
}: {
  collection: NftCollection
  lcd: string
  owner: string
}) => {
  const entries: TokenEntry[] = []
  let startAfter: string | undefined
  let queryName: "tokens" | "tokens_by_owner" = "tokens"

  while (entries.length < MAX_TOKENS_PER_COLLECTION) {
    let response: unknown
    try {
      response = await queryContractSmartAt<unknown>({
        address: collection.contract,
        lcd,
        query: {
          [queryName]: {
            owner,
            limit: TOKENS_PAGE_SIZE,
            ...(startAfter ? { start_after: startAfter } : {})
          }
        }
      })
    } catch (error) {
      if (entries.length || queryName === "tokens_by_owner") throw error
      queryName = "tokens_by_owner"
      continue
    }
    const page = extractNftTokenEntries(response)
    if (!page.length) break
    entries.push(...page)
    if (page.length < TOKENS_PAGE_SIZE) break
    const nextStart = page[page.length - 1]?.tokenId
    if (!nextStart || nextStart === startAfter) break
    startAfter = nextStart
  }

  return entries.slice(0, MAX_TOKENS_PER_COLLECTION)
}

const extractNftInfo = (value: unknown) => {
  const record = isRecord(value) ? value : undefined
  const extension = isRecord(record?.extension) ? record.extension : undefined
  const metadata = parseNftMetadata(extension)
  return {
    tokenUri: readRecordString(
      record,
      "token_uri",
      "tokenUri",
      "metadata_uri",
      "metadataUri"
    ),
    ...metadata
  }
}

export const fetchOwnedNfts = async ({
  chainKey,
  lcd,
  owner,
  additionalCollections = []
}: {
  chainKey: AppChainKey
  lcd: string
  owner: string
  additionalCollections?: readonly NftCollection[]
}): Promise<OwnedNftResult> => {
  if (!isTerraAddress(owner)) throw new Error("Invalid Terra wallet address")

  const [registryCollections, candidateContracts] = await Promise.all([
    fetchNftCollections(chainKey).catch(() => []),
    fetchNftContractCandidates({ lcd, owner })
  ])
  const cachedCollections = loadCachedNftCollections(chainKey)
  const knownContracts = new Set(
    mergeNftCollections(
      registryCollections,
      cachedCollections,
      additionalCollections
    ).map((collection) => collection.contract)
  )
  const discoveredCollections = (
    await mapWithConcurrency(
      candidateContracts.filter((contract) => !knownContracts.has(contract)),
      4,
      async (contract) => {
        try {
          return await fetchNftCollection({ contract, lcd })
        } catch {
          return undefined
        }
      }
    )
  ).filter((collection): collection is NftCollection => Boolean(collection))
  if (discoveredCollections.length) {
    rememberNftCollections(chainKey, discoveredCollections)
  }
  const collections = mergeNftCollections(
    registryCollections,
    cachedCollections,
    additionalCollections,
    discoveredCollections
  )
  let scannedCollections = 0
  let failedCollections = 0

  const collectionResults = await mapWithConcurrency(
    collections,
    COLLECTION_QUERY_CONCURRENCY,
    async (collection) => {
      try {
        const tokens = await fetchCollectionTokenEntries({ collection, lcd, owner })
        scannedCollections += 1
        return tokens.map((token) => ({ collection, token }))
      } catch {
        failedCollections += 1
        return []
      }
    }
  )

  if (collections.length > 0 && scannedCollections === 0) {
    throw new Error("NFT ownership data is temporarily unavailable")
  }

  const tokenRefs = collectionResults.flat().slice(0, MAX_OWNED_NFTS)
  const items = await mapWithConcurrency(
    tokenRefs,
    NFT_INFO_QUERY_CONCURRENCY,
    async ({ collection, token }) => {
      let info: Partial<ReturnType<typeof extractNftInfo>> = {}
      try {
        const response = await queryContractSmartAt<unknown>({
          address: collection.contract,
          lcd,
          query: { nft_info: { token_id: token.tokenId } }
        })
        info = extractNftInfo(response)
      } catch {
        // Some legacy collections use a non-standard metadata query.
      }

      return {
        contract: collection.contract,
        tokenId: token.tokenId,
        tokenUri: normalizeNftUri(info.tokenUri ?? token.tokenUri),
        name: info.name,
        description: info.description,
        image: info.image,
        animationUrl: info.animationUrl,
        externalUrl: info.externalUrl,
        attributes: info.attributes ?? [],
        collectionName: collection.name,
        collectionSymbol: collection.symbol,
        collectionIcon: collection.icon,
        collectionHomepage: collection.homepage,
        collectionMarketplace: collection.marketplace
      } satisfies OwnedNft
    }
  )

  return {
    items,
    collectionCount: collections.length,
    scannedCollections,
    failedCollections,
    discoveredCollections: discoveredCollections.length,
    truncated: collectionResults.flat().length > MAX_OWNED_NFTS
  }
}

const parseDataJsonUri = (uri: string) => {
  const commaIndex = uri.indexOf(",")
  if (commaIndex < 0) return undefined
  const header = uri.slice(0, commaIndex)
  const payload = uri.slice(commaIndex + 1)
  const decoded = /;base64/i.test(header)
    ? atob(payload)
    : decodeURIComponent(payload)
  return JSON.parse(decoded) as unknown
}

export const parseNftMetadata = (value: unknown): NftMetadata => {
  const record = isRecord(value) ? value : undefined
  const attributeCandidates = Array.isArray(record?.attributes)
    ? record.attributes
    : Array.isArray(record?.traits)
      ? record.traits
      : []
  const attributes = attributeCandidates.flatMap((attribute) => {
    if (!isRecord(attribute)) return []
    const traitType = readRecordString(
      attribute,
      "trait_type",
      "traitType",
      "type",
      "name"
    )
    const rawValue = attribute.value
    const attributeValue =
      typeof rawValue === "string" || typeof rawValue === "number"
        ? String(rawValue).trim()
        : undefined
    return traitType && attributeValue ? [{ traitType, value: attributeValue }] : []
  })
  return {
    name: readRecordString(record, "name", "title"),
    description: readRecordString(record, "description"),
    image: normalizeNftImage(
      readRecordString(record, "image", "image_url", "imageUri", "image_uri")
    ),
    animationUrl: normalizeNftImage(
      readRecordString(record, "animation_url", "animationUrl")
    ),
    externalUrl: normalizeNftUri(
      readRecordString(record, "external_url", "externalUrl")
    ),
    attributes
  }
}

export const fetchNftMetadata = async (tokenUri: string) => {
  const candidates = buildNftMetadataCandidates(tokenUri)
  const first = candidates[0]
  if (!first) return { attributes: [] }
  if (first.startsWith("data:application/")) {
    return parseNftMetadata(parseDataJsonUri(first))
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000)
      })
      if (!response.ok) continue
      const text = await response.text()
      if (!text || text.length > 1_000_000) continue
      return parseNftMetadata(JSON.parse(text) as unknown)
    } catch {
      // Try the next public gateway for legacy IPFS metadata.
    }
  }
  return { attributes: [] }
}

export { DEFAULT_NFT_IMAGE }
