import type { AppChainKey } from "../appChains"
import { BURRITO_REGISTRY_API_URL } from "../config/externalServices"
import { sanitizeAssetIconUrl } from "../utils/assetIcons"
import type { Cw20Token, IbcToken } from "./terraAssets"

type VerifiedRegistryAsset = {
  chainId: string
  type: "cw20" | "ibc"
  assetKey: string
  name: string | null
  symbol: string | null
  decimals: number | null
  logoUrl: string | null
  baseDenom?: string
  path?: string
  aliases?: string[]
  verifiedAt: number | null
  updatedAt: number
}

type RegistryResponse = { assets?: VerifiedRegistryAsset[] }

export type VerifiedTokenRegistry = {
  cw20: Record<string, Cw20Token>
  ibc: Record<string, IbcToken>
}

const EMPTY_REGISTRY: VerifiedTokenRegistry = { cw20: {}, ibc: {} }
const registryPromises = new Map<
  AppChainKey,
  { expiresAt: number; promise: Promise<VerifiedTokenRegistry> }
>()

const validDecimals = (value: number | null) =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 30
    ? Number(value)
    : 6

export const mapVerifiedRegistryAssets = (
  assets: VerifiedRegistryAsset[]
): VerifiedTokenRegistry => {
  const result: VerifiedTokenRegistry = { cw20: {}, ibc: {} }
  assets.forEach((asset) => {
    const symbol = asset.symbol?.trim()
    const name = asset.name?.trim() || symbol
    if (!symbol || !name) return
    const icon = sanitizeAssetIconUrl(asset.logoUrl ?? undefined)
    if (asset.type === "cw20") {
      const contract = asset.assetKey.trim().toLowerCase()
      if (!contract.startsWith("terra1")) return
      result.cw20[contract] = {
        token: contract,
        symbol,
        name,
        decimals: validDecimals(asset.decimals),
        icon
      }
      return
    }
    const hash = asset.assetKey.replace(/^ibc\//i, "").trim().toUpperCase()
    if (!/^[A-F0-9]{64}$/.test(hash)) return
    result.ibc[hash] = {
      denom: `ibc/${hash}`,
      base_denom: asset.baseDenom?.trim() || `ibc/${hash}`,
      symbol,
      name,
      decimals: validDecimals(asset.decimals),
      icon,
      path: asset.path?.trim() || undefined
    }
  })
  return result
}

export const fetchVerifiedTokenRegistry = async (
  chainKey: AppChainKey
): Promise<VerifiedTokenRegistry> => {
  if (!BURRITO_REGISTRY_API_URL) return EMPTY_REGISTRY
  const existing = registryPromises.get(chainKey)
  if (existing && existing.expiresAt > Date.now()) return existing.promise
  const request = fetch(
    `${BURRITO_REGISTRY_API_URL}/v1/registry/assets?chain=${chainKey}&limit=1000`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2_500)
    }
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`)
      const payload = (await response.json()) as RegistryResponse
      return mapVerifiedRegistryAssets(payload.assets ?? [])
    })
    .catch(() => EMPTY_REGISTRY)
  registryPromises.set(chainKey, {
    expiresAt: Date.now() + 5 * 60 * 1000,
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
