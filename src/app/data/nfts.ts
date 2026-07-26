import type { AppChainKey } from "../appChains"
import { ASSET_URL } from "../config/externalServices"
import { fetchWithEndpointFallback } from "./endpointFallback"

const NFT_REGISTRY_URL = `${ASSET_URL}/cw721/contracts.json`
const COLLECTION_QUERY_CONCURRENCY = 6
const NFT_INFO_QUERY_CONCURRENCY = 8
const TOKENS_PAGE_SIZE = 50
const MAX_TOKENS_PER_COLLECTION = 250
const MAX_OWNED_NFTS = 400
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
  collectionName: string
  collectionSymbol?: string
  collectionIcon?: string
}

export type OwnedNftResult = {
  items: OwnedNft[]
  collectionCount: number
  scannedCollections: number
  failedCollections: number
  truncated: boolean
}

export type NftMetadata = {
  name?: string
  description?: string
  image?: string
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

const isTerraAddress = (value: string) => /^terra1[0-9a-z]{20,90}$/.test(value)

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

  while (entries.length < MAX_TOKENS_PER_COLLECTION) {
    const response = await queryContractSmartAt<unknown>({
      address: collection.contract,
      lcd,
      query: {
        tokens: {
          owner,
          limit: TOKENS_PAGE_SIZE,
          ...(startAfter ? { start_after: startAfter } : {})
        }
      }
    })
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
  return {
    tokenUri: readRecordString(
      record,
      "token_uri",
      "tokenUri",
      "metadata_uri",
      "metadataUri"
    ),
    name: readRecordString(extension, "name", "title"),
    description: readRecordString(extension, "description"),
    image: normalizeNftImage(
      readRecordString(extension, "image", "image_url", "imageUri", "image_uri")
    )
  }
}

export const fetchOwnedNfts = async ({
  chainKey,
  lcd,
  owner
}: {
  chainKey: AppChainKey
  lcd: string
  owner: string
}): Promise<OwnedNftResult> => {
  if (!isTerraAddress(owner)) throw new Error("Invalid Terra wallet address")

  const collections = await fetchNftCollections(chainKey)
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
        collectionName: collection.name,
        collectionSymbol: collection.symbol,
        collectionIcon: collection.icon
      } satisfies OwnedNft
    }
  )

  return {
    items,
    collectionCount: collections.length,
    scannedCollections,
    failedCollections,
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
  return {
    name: readRecordString(record, "name", "title"),
    description: readRecordString(record, "description"),
    image: normalizeNftImage(
      readRecordString(record, "image", "image_url", "imageUri", "image_uri")
    )
  }
}

export const fetchNftMetadata = async (tokenUri: string) => {
  const normalized = normalizeNftUri(tokenUri)
  if (!normalized) return {}
  if (normalized.startsWith("data:application/")) {
    return parseNftMetadata(parseDataJsonUri(normalized))
  }

  const response = await fetch(normalized, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000)
  })
  if (!response.ok) return {}
  const text = await response.text()
  if (!text || text.length > 1_000_000) return {}
  try {
    return parseNftMetadata(JSON.parse(text) as unknown)
  } catch {
    return {}
  }
}

export { DEFAULT_NFT_IMAGE }
