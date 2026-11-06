import { getActiveAppChainRuntime } from "../activeChain"
import { withInFlightAssetRequest } from "./assetMetadataRequests"
import { fetchWithEndpointFallback } from "./endpointFallback"

export type NativeSupplyInfo = {
  denom: string
  amount: string
  units: number
  decimals: number
}

type NativeSupplyScope = { chainId: string; lcd: string }
const SUPPLY_CACHE_TTL_MS = 10 * 60 * 1000
const SUPPLY_CACHE_LIMIT = 256
// Cache raw public chain data only: verified decimals can change independently.
const supplyCache = new Map<string, { amount: string; fetchedAt: number }>()

const readRawSupply = (denom: string, { chainId, lcd }: NativeSupplyScope) => {
  const url = new URL(`${lcd}/cosmos/bank/v1beta1/supply/by_denom`)
  url.searchParams.set("denom", denom)
  const endpoint = url.toString()
  const key = `${chainId}\u0000${endpoint}`
  const cached = supplyCache.get(key)
  const age = cached ? Date.now() - cached.fetchedAt : -1
  if (cached && age >= 0 && age < SUPPLY_CACHE_TTL_MS) {
    return Promise.resolve(cached.amount)
  }
  supplyCache.delete(key)

  return withInFlightAssetRequest(chainId, endpoint, async () => {
    const response = await fetchWithEndpointFallback(endpoint)
    if (!response.ok) throw new Error("Native supply unavailable")
    const data = (await response.json()) as {
      amount?: { denom?: unknown; amount?: unknown }
    } | null
    const amount = data?.amount?.amount
    if (
      typeof amount !== "string" || !/^\d+$/.test(amount) ||
      !Number.isFinite(Number(amount)) ||
      (data?.amount?.denom !== undefined && data.amount.denom !== denom)
    ) {
      throw new Error("Invalid native supply response")
    }
    supplyCache.set(key, { amount, fetchedAt: Date.now() })
    if (supplyCache.size > SUPPLY_CACHE_LIMIT) {
      const oldest = supplyCache.keys().next().value
      if (oldest !== undefined) supplyCache.delete(oldest)
    }
    return amount
  })
}

export const fetchNativeSupplies = async (
  entries: Array<{ denom: string; decimals: number }>,
  scope: NativeSupplyScope = getActiveAppChainRuntime().chain
) => {
  // Capture both values before any await; active-chain proxies must not drive workers.
  const { chainId, lcd } = scope
  const unique = Array.from(new Set(entries.map((entry) => entry.denom).filter(Boolean)))
  if (!unique.length) return {}
  const decimalsMap = new Map(entries.map((entry) => [entry.denom, entry.decimals]))
  const result: Record<string, NativeSupplyInfo> = {}
  let index = 0
  const workers = Array.from({ length: Math.min(6, unique.length) }, async () => {
    while (index < unique.length) {
      const denom = unique[index++]
      const decimals = decimalsMap.get(denom) ?? 6
      if (!Number.isInteger(decimals) || decimals < 0) continue
      try {
        const amount = await readRawSupply(denom, { chainId, lcd })
        const scale = 10 ** decimals
        if (!Number.isFinite(scale)) continue
        result[denom] = { denom, amount, units: Number(amount) / scale, decimals }
      } catch {
        // Preserve successful siblings. Failed reads are never cached as zero.
      }
    }
  })
  await Promise.all(workers)
  return result
}
