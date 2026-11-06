import type { AppChainKey } from "../appChains"
import { BURRITO_REGISTRY_API_URL } from "../config/externalServices"
import { sanitizeAssetIconUrl } from "../utils/assetIcons"
import {
  isTerraAddress,
  resolveSafeDisplayName,
  resolveSafeDisplaySymbol
} from "../utils/assetIdentity"
import type { Cw20Token, IbcToken } from "./terraAssets"
import { withRequestDeadline } from "./requestDeadline"

type VerifiedRegistryAsset = {
  chainId: string
  type: "cw20" | "ibc"
  assetKey: string
  name: string | null
  symbol: string | null
  decimals: number | null
  logoUrl: string | null
  baseDenom?: string | null
  path?: string | null
  verificationStatus?: string | null
  verificationMethod?: string | null
  originChainId?: string | null
  originDenom?: string | null
  issuer?: string | null
  transport?: string | null
  provenanceLabel?: string | null
  source?: string | null
  aliases?: string[]
  verifiedAt: number | null
  updatedAt: number
}

export type VerifiedTokenRegistry = {
  cw20: Record<string, Cw20Token>
  ibc: Record<string, IbcToken>
}

const EMPTY_REGISTRY: VerifiedTokenRegistry = { cw20: {}, ibc: {} }
const registryPromises = new Map<
  AppChainKey,
  { expiresAt: number; promise: Promise<VerifiedTokenRegistry> }
>()

const validDecimals = (value: unknown) =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 30
    ? Number(value)
    : undefined

// Registry responses are external data: one malformed row must not discard
// every otherwise usable asset, or turn an unknown type into an IBC token.
const isRegistryAsset = (value: unknown): value is VerifiedRegistryAsset => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const asset = value as Record<string, unknown>
  if (typeof asset.chainId !== "string" || typeof asset.assetKey !== "string") return false
  if (asset.type !== "cw20" && asset.type !== "ibc") return false
  if (asset.type === "cw20") {
    if (!isTerraAddress(asset.assetKey)) return false
  } else if (!/^[A-F0-9]{64}$/i.test(asset.assetKey.replace(/^ibc\//i, "").trim())) {
    return false
  }
  if (!["name", "symbol", "logoUrl"].every((key) =>
    asset[key] == null || typeof asset[key] === "string"
  )) return false
  return [
    "baseDenom", "path", "verificationStatus", "verificationMethod",
    "originChainId", "originDenom", "issuer", "transport", "provenanceLabel", "source"
  ].every((key) => asset[key] == null || typeof asset[key] === "string")
}

export const mapVerifiedRegistryAssets = (
  assets: unknown[]
): VerifiedTokenRegistry => {
  const result: VerifiedTokenRegistry = { cw20: {}, ibc: {} }
  assets.forEach((asset) => {
    if (!isRegistryAsset(asset)) return
    if (asset.type === "cw20") {
      const contract = asset.assetKey.trim().toLowerCase()
      if (!isTerraAddress(contract)) return
      const fallback = `CW20-${contract.slice(6, 12).toUpperCase()}`
      const symbol = resolveSafeDisplaySymbol(asset.symbol ?? undefined, fallback)
      const name = resolveSafeDisplayName(asset.name ?? undefined, symbol)
      const icon = sanitizeAssetIconUrl(asset.logoUrl ?? undefined)
      result.cw20[contract] = {
        token: contract,
        symbol,
        name,
        decimals: validDecimals(asset.decimals),
        icon,
        verificationStatus: asset.verificationStatus ?? undefined,
        verificationMethod: asset.verificationMethod ?? undefined,
        originChainId: asset.originChainId ?? undefined,
        originDenom: asset.originDenom ?? undefined,
        issuer: asset.issuer ?? undefined,
        transport: asset.transport ?? undefined,
        provenanceLabel: asset.provenanceLabel ?? undefined,
        source: asset.source ?? undefined
      }
      return
    }
    const hash = asset.assetKey.replace(/^ibc\//i, "").trim().toUpperCase()
    if (!/^[A-F0-9]{64}$/.test(hash)) return
    const symbol = resolveSafeDisplaySymbol(asset.symbol ?? undefined, "IBC")
    const name = resolveSafeDisplayName(asset.name ?? undefined, symbol)
    const icon = sanitizeAssetIconUrl(asset.logoUrl ?? undefined)
    result.ibc[hash] = {
      denom: `ibc/${hash}`,
      base_denom: asset.baseDenom?.trim() || `ibc/${hash}`,
      symbol,
      name,
      decimals: validDecimals(asset.decimals),
      icon,
      path: asset.path?.trim() || undefined,
      verificationStatus: asset.verificationStatus ?? undefined,
      verificationMethod: asset.verificationMethod ?? undefined,
      originChainId: asset.originChainId ?? undefined,
      originDenom: asset.originDenom ?? undefined,
      issuer: asset.issuer ?? undefined,
      transport: asset.transport ?? undefined,
      provenanceLabel: asset.provenanceLabel ?? undefined,
      source: asset.source ?? undefined
    }
  })
  return result
}

const fetchRegistryPages = (chainKey: AppChainKey) => withRequestDeadline(async (signal) => {
  const assets: VerifiedRegistryAsset[] = []
  const seenCursors = new Set<string>()
  const chainId = chainKey === "lunc" ? "columbus-5" : "phoenix-1"
  let cursor: string | undefined
  // Bounded traversal prevents a broken/malicious continuation from looping
  // forever. Hitting a bound is an error, never a cached complete registry.
  for (let page = 0; page < 32; page += 1) {
    const params = new URLSearchParams({ chain: chainKey, limit: "1000", pagination: "cursor" })
    if (cursor) params.set("cursor", cursor)
    const payload = await withRequestDeadline(async (pageSignal) => {
      const response = await fetch(`${BURRITO_REGISTRY_API_URL}/v1/registry/assets?${params}`, {
        headers: { accept: "application/json" }, signal: pageSignal
      })
      if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`)
      return await response.json() as unknown
    }, { signal, timeoutMs: 2_500 })
    if (!payload || typeof payload !== "object" ||
      !Array.isArray((payload as { assets?: unknown }).assets)) {
      throw new Error("Registry assets must be an array")
    }
    const body = payload as { assets: unknown[]; pagination?: unknown }
    if (body.assets.length > 1000) throw new Error("Registry page exceeds requested limit")
    const validAssets = body.assets.filter(isRegistryAsset)
    if (body.assets.length && !validAssets.length) throw new Error("Registry assets contain no usable records")
    assets.push(...validAssets.filter((asset) => asset.chainId === chainId))
    // Old servers do not advertise pagination. Preserve backwards compatibility;
    // complete coverage beyond their old cap requires deploying the API first.
    if (body.pagination === undefined && page === 0) return mapVerifiedRegistryAssets(assets)
    if (!body.pagination || typeof body.pagination !== "object") throw new Error("Invalid registry pagination")
    const continuation = body.pagination as { hasMore?: unknown; nextCursor?: unknown }
    if (continuation.hasMore === false && continuation.nextCursor === null) return mapVerifiedRegistryAssets(assets)
    if (continuation.hasMore !== true || typeof continuation.nextCursor !== "string" ||
      !continuation.nextCursor.length || continuation.nextCursor.length > 1024 ||
      seenCursors.has(continuation.nextCursor)) throw new Error("Invalid registry continuation")
    cursor = continuation.nextCursor
    seenCursors.add(cursor)
  }
  throw new Error("Registry traversal exceeds bounded page limit")
}, { timeoutMs: 15_000 })

export const fetchVerifiedTokenRegistry = async (
  chainKey: AppChainKey
): Promise<VerifiedTokenRegistry> => {
  if (!BURRITO_REGISTRY_API_URL) return EMPTY_REGISTRY
  const existing = registryPromises.get(chainKey)
  if (existing && existing.expiresAt > Date.now()) return existing.promise
  const request = fetchRegistryPages(chainKey)
    .then((registry) => {
      // Pending work is deduplicated independently of its duration. Freshness
      // starts only after a successful response, never after a failed attempt.
      const entry = registryPromises.get(chainKey)
      if (entry?.promise === request) entry.expiresAt = Date.now() + 5 * 60 * 1000
      return registry
    })
    .catch(() => {
      if (registryPromises.get(chainKey)?.promise === request) {
        registryPromises.delete(chainKey)
      }
      return EMPTY_REGISTRY
    })
  registryPromises.set(chainKey, {
    expiresAt: Infinity,
    promise: request
  })
  return request
}

export const submitRegistryDiscovery = ({
  chainKey,
  contractAddress,
  txHash
}: {
  chainKey: AppChainKey
  contractAddress: string
  txHash?: string
}) => {
  if (!BURRITO_REGISTRY_API_URL || !contractAddress) return Promise.resolve(false)
  return fetch(`${BURRITO_REGISTRY_API_URL}/v1/registry/discover`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      chain: chainKey,
      assetType: "cw20",
      assetKey: contractAddress,
      txHash
    })
  }).then((response) => response.ok)
}
