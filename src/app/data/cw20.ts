import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"
import type { Cw20Token } from "./terraAssets"

export type Cw20Balance = Cw20Token & {
  address: string
  balance: string
}

type Cw20BalanceOptions = {
  forceContracts?: string[]
}

const CACHE_TTL = 5 * 60 * 1000
const SUPPLY_CACHE_TTL = 15 * 60 * 1000
const BALANCE_CACHE_VERSION = "v2"
const BALANCE_FETCH_ATTEMPTS = 2
const BALANCE_FETCH_RETRY_DELAY_MS = 200

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })

const loadCache = (key: string) => {
  if (typeof window === "undefined") return undefined
  const cached = window.localStorage.getItem(key)
  if (!cached) return undefined
  try {
    const parsed = JSON.parse(cached) as { ts: number; data: Record<string, string> }
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

const saveCache = (key: string, data: Record<string, string>) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Ignore storage failures in private browsing or low-storage mobile contexts.
  }
}

const buildWhitelistSignature = (whitelist: Record<string, Cw20Token>) => {
  const keys = Object.keys(whitelist)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean)
    .sort()

  let hash = 0
  for (const key of keys) {
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 33 + key.charCodeAt(index)) >>> 0
    }
  }

  return `${keys.length}:${hash.toString(16)}`
}

const fetchCw20BalanceResult = async (
  address: string,
  contract: string
): Promise<{ balance: string; invalid?: boolean } | undefined> => {
  const query = btoa(JSON.stringify({ balance: { address } }))

  for (let attempt = 0; attempt < BALANCE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(
        `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`
      )

      if (!res.ok) {
        const message = await res.text()
        if (message.includes("no such contract")) {
          return { balance: "0", invalid: true }
        }
      } else {
        const data = (await res.json()) as { data?: { balance?: string } }
        return { balance: data?.data?.balance ?? "0" }
      }

      if (attempt < BALANCE_FETCH_ATTEMPTS - 1) {
        await delay(BALANCE_FETCH_RETRY_DELAY_MS)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? "")
      if (message.includes("no such contract")) {
        return { balance: "0", invalid: true }
      }
      if (attempt < BALANCE_FETCH_ATTEMPTS - 1) {
        await delay(BALANCE_FETCH_RETRY_DELAY_MS)
      }
    }
  }

  return undefined
}

export const fetchCw20Balances = async (
  address: string,
  whitelist: Record<string, Cw20Token>,
  options: Cw20BalanceOptions = {}
) => {
  if (!address) return []

  const forceContracts = new Set(
    (options.forceContracts ?? [])
      .map((contract) => contract.trim().toLowerCase())
      .filter(Boolean)
  )
  const whitelistSignature = buildWhitelistSignature(whitelist)
  const cacheKey = `cw20balance:${BALANCE_CACHE_VERSION}:${address}:classic:${whitelistSignature}`
  const invalidKey = "cw20invalid:classic"
  const cached = loadCache(cacheKey)
  const invalidCached = loadCache(invalidKey) as Record<string, string> | undefined
  const invalidContracts: Record<string, boolean> = {}

  if (invalidCached) {
    Object.keys(invalidCached).forEach((key) => {
      invalidContracts[key] = true
    })
  }

  const results: Record<string, string> = cached ? { ...cached } : {}
  const entries = Object.entries(whitelist).filter(([contract]) => {
    const normalized = contract.toLowerCase()
    if (forceContracts.has(normalized)) return true
    if (invalidContracts[normalized]) return false
    return !(normalized in results)
  })
  const limit = 4
  let index = 0

  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (index < entries.length) {
      const current = index
      index += 1
      const [contractRaw] = entries[current]
      const contract = contractRaw.toLowerCase()
      const result = await fetchCw20BalanceResult(address, contract)
      if (!result) continue
      if (result.invalid && !forceContracts.has(contract)) {
        invalidContracts[contract] = true
      }
      results[contract] = result.balance
    }
  })

  await Promise.all(workers)

  saveCache(cacheKey, results)
  saveCache(invalidKey, Object.fromEntries(Object.keys(invalidContracts).map((k) => [k, "1"])))

  return Object.entries(results).map(([token, balance]) => ({
    ...whitelist[token],
    address: token,
    balance
  }))
}

export const fetchCw20Balance = async (address: string, contract: string) => {
  const normalizedAddress = address.trim()
  const normalizedContract = contract.trim().toLowerCase()
  if (!normalizedAddress || !normalizedContract) return "0"

  const result = await fetchCw20BalanceResult(normalizedAddress, normalizedContract)
  if (!result) {
    throw new Error(`Failed to fetch CW20 balance for ${normalizedContract}`)
  }
  return result.balance
}

export const useCw20Balances = (
  address: string | undefined,
  whitelist?: Record<string, Cw20Token>,
  options: Cw20BalanceOptions = {}
) => {
  const whitelistSignature = buildWhitelistSignature(whitelist ?? {})
  const forceSignature = (options.forceContracts ?? [])
    .map((contract) => contract.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",")

  return useQuery({
    queryKey: ["cw20-balances", address, whitelistSignature, forceSignature],
    queryFn: () => fetchCw20Balances(address ?? "", whitelist ?? {}, options),
    enabled: Boolean(address && whitelist && Object.keys(whitelist).length),
    staleTime: forceSignature ? 0 : 60_000,
    refetchOnMount: forceSignature ? "always" : true
  })
}

type Cw20TokenInfoResponse = {
  data?: {
    total_supply?: string
    decimals?: number
  }
}

export type Cw20SupplyInfo = {
  totalSupply: string
  decimals: number
  units: number
}

const toUnits = (amount: string, decimals: number) => {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed)) return 0
  return parsed / 10 ** Math.max(0, decimals)
}

export const fetchCw20Supplies = async (
  contracts: string[],
  whitelist: Record<string, Cw20Token>
) => {
  const unique = Array.from(
    new Set(
      contracts
        .map((contract) => contract.trim().toLowerCase())
        .filter(Boolean)
    )
  )
  if (!unique.length) return {}

  const cacheKey = `cw20supply:classic:${unique.join(",")}`
  const cached = loadCache(cacheKey) as Record<string, string> | undefined
  if (cached) {
    const restored: Record<string, Cw20SupplyInfo> = {}
    Object.entries(cached).forEach(([contract, payload]) => {
      try {
        const parsed = JSON.parse(payload) as Cw20SupplyInfo
        restored[contract] = parsed
      } catch {
        // ignore invalid cache entry
      }
    })
    if (Object.keys(restored).length) return restored
  }

  const results: Record<string, Cw20SupplyInfo> = {}
  const limit = 4
  let index = 0

  const workers = Array.from({ length: Math.min(limit, unique.length) }, async () => {
    while (index < unique.length) {
      const current = index
      index += 1
      const contract = unique[current]
      try {
        const query = btoa(JSON.stringify({ token_info: {} }))
        const res = await fetch(
          `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`
        )
        if (!res.ok) continue
        const data = (await res.json()) as Cw20TokenInfoResponse
        const tokenInfo = data?.data
        const totalSupply = tokenInfo?.total_supply
        if (!totalSupply) continue
        const decimals = tokenInfo?.decimals ?? whitelist[contract]?.decimals ?? 6
        results[contract] = {
          totalSupply,
          decimals,
          units: toUnits(totalSupply, decimals)
        }
      } catch {
        // Ignore per-contract failure.
      }
    }
  })

  await Promise.all(workers)

  if (Object.keys(results).length) {
    const serializable = Object.fromEntries(
      Object.entries(results).map(([contract, info]) => [contract, JSON.stringify(info)])
    )
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        cacheKey,
        JSON.stringify({ ts: Date.now(), data: serializable })
      )
    }
  }
  return results
}

export const useCw20Supplies = (
  contracts: string[],
  whitelist?: Record<string, Cw20Token>
) => {
  const normalized = Array.from(
    new Set(contracts.map((contract) => contract.trim().toLowerCase()).filter(Boolean))
  ).sort()

  return useQuery({
    queryKey: ["cw20-supplies", normalized.join(",")],
    queryFn: () => fetchCw20Supplies(normalized, whitelist ?? {}),
    enabled: normalized.length > 0,
    staleTime: SUPPLY_CACHE_TTL
  })
}
