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

const CACHE_TTL = 30 * 60 * 1000
const SUPPLY_CACHE_TTL = 15 * 60 * 1000
const BALANCE_CACHE_VERSION = "v2"
const SINGLE_BALANCE_CACHE_VERSION = "v1"
const ACTIVE_BALANCE_CACHE_VERSION = "v1"
const BALANCE_FETCH_ATTEMPTS = 2
const BALANCE_FETCH_RETRY_DELAY_MS = 200
const BALANCE_FETCH_CONCURRENCY = 8

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })

const loadCachePayload = (key: string, ttl = CACHE_TTL) => {
  if (typeof window === "undefined") return undefined
  const cached = window.localStorage.getItem(key)
  if (!cached) return undefined
  try {
    const parsed = JSON.parse(cached) as { ts: number; data: Record<string, string> }
    if (!parsed?.ts || Date.now() - parsed.ts > ttl) return undefined
    return parsed
  } catch {
    return undefined
  }
}

const loadCache = (key: string, ttl = CACHE_TTL) => loadCachePayload(key, ttl)?.data

const saveCache = (key: string, data: Record<string, string>) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Ignore storage failures in private browsing or low-storage mobile contexts.
  }
}

type SingleBalanceCache = {
  ts: number
  balance: string
}

const normalizeAddress = (address: string | undefined) =>
  address?.trim().toLowerCase() ?? ""

const normalizeContract = (contract: string | undefined) =>
  contract?.trim().toLowerCase() ?? ""

const buildSingleBalanceCacheKey = (address: string, contract: string) =>
  `cw20balance-single:${SINGLE_BALANCE_CACHE_VERSION}:${address
    .trim()
    .toLowerCase()}:classic:${contract.trim().toLowerCase()}`

const loadSingleBalanceCache = (
  address: string | undefined,
  contract: string
): SingleBalanceCache | undefined => {
  if (!address || typeof window === "undefined") return undefined
  try {
    const cached = window.localStorage.getItem(
      buildSingleBalanceCacheKey(address, contract)
    )
    if (!cached) return undefined
    const parsed = JSON.parse(cached) as SingleBalanceCache
    if (
      typeof parsed.balance !== "string" ||
      typeof parsed.ts !== "number" ||
      Date.now() - parsed.ts > CACHE_TTL
    ) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

const saveSingleBalanceCache = (
  address: string | undefined,
  contract: string,
  balance: string | undefined
) => {
  if (!address || !contract || balance === undefined || typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(
      buildSingleBalanceCacheKey(address, contract),
      JSON.stringify({ ts: Date.now(), balance })
    )
  } catch {
    // Ignore storage failures; focused live balance fetching still works.
  }
}

const buildActiveBalanceCacheKey = (address: string) =>
  `cw20balance-active:${ACTIVE_BALANCE_CACHE_VERSION}:${address
    .trim()
    .toLowerCase()}:classic`

const loadActiveBalanceContracts = (address: string | undefined) => {
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress || typeof window === "undefined") return []
  try {
    const cached = window.localStorage.getItem(
      buildActiveBalanceCacheKey(normalizedAddress)
    )
    if (!cached) return []
    const parsed = JSON.parse(cached) as { ts: number; contracts: string[] }
    if (
      typeof parsed.ts !== "number" ||
      !Array.isArray(parsed.contracts) ||
      Date.now() - parsed.ts > CACHE_TTL
    ) {
      return []
    }
    return parsed.contracts.map(normalizeContract).filter(Boolean)
  } catch {
    return []
  }
}

const saveActiveBalanceContracts = (
  address: string | undefined,
  balances: Record<string, string>
) => {
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress || typeof window === "undefined") return
  const active = new Set(loadActiveBalanceContracts(normalizedAddress))
  Object.entries(balances).forEach(([contractRaw, balance]) => {
    const contract = normalizeContract(contractRaw)
    if (!contract) return
    if (Number(balance) > 0) {
      active.add(contract)
      return
    }
    active.delete(contract)
  })
  const contracts = Array.from(active)
  try {
    window.localStorage.setItem(
      buildActiveBalanceCacheKey(normalizedAddress),
      JSON.stringify({ ts: Date.now(), contracts })
    )
  } catch {
    // Ignore storage failures; the full whitelist scan remains the source of truth.
  }
}

export const getCachedCw20ContractBalances = (
  address: string | undefined,
  contracts: string[]
) => {
  const entries = contracts
    .map((contract) => contract.trim().toLowerCase())
    .filter(Boolean)
    .map((contract) => {
      const cached = loadSingleBalanceCache(address, contract)
      return cached ? ([contract, cached] as const) : undefined
    })
    .filter(
      (entry): entry is readonly [string, SingleBalanceCache] => Boolean(entry)
    )

  if (!entries.length) return undefined

  return {
    data: Object.fromEntries(
      entries.map(([contract, cached]) => [contract, cached.balance])
    ) as Record<string, string>,
    updatedAt: Math.min(...entries.map(([, cached]) => cached.ts))
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

const buildBalanceCacheKey = (
  address: string,
  whitelist: Record<string, Cw20Token>
) =>
  `cw20balance:${BALANCE_CACHE_VERSION}:${address}:classic:${buildWhitelistSignature(
    whitelist
  )}`

const mapCw20BalanceResults = (
  results: Record<string, string>,
  whitelist: Record<string, Cw20Token>
) =>
  Object.entries(results).map(([token, balance]) => ({
    ...whitelist[token],
    address: token,
    balance
  }))

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
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress) return []

  const forceContracts = new Set(
    (options.forceContracts ?? [])
      .map(normalizeContract)
      .filter(Boolean)
  )
  const cacheKey = buildBalanceCacheKey(normalizedAddress, whitelist)
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
  loadActiveBalanceContracts(normalizedAddress).forEach((contract) => {
    if (!(contract in whitelist) || contract in results) return
    const cachedSingle = loadSingleBalanceCache(normalizedAddress, contract)
    if (cachedSingle) {
      results[contract] = cachedSingle.balance
    }
  })
  const entries = Object.entries(whitelist).filter(([contract]) => {
    const normalized = contract.toLowerCase()
    if (forceContracts.has(normalized)) return true
    if (invalidContracts[normalized]) return false
    return true
  })
  const limit = BALANCE_FETCH_CONCURRENCY
  let index = 0

  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (index < entries.length) {
      const current = index
      index += 1
      const [contractRaw] = entries[current]
      const contract = contractRaw.toLowerCase()
      const result = await fetchCw20BalanceResult(normalizedAddress, contract)
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
  Object.entries(results).forEach(([contract, balance]) => {
    saveSingleBalanceCache(normalizedAddress, contract, balance)
  })
  saveActiveBalanceContracts(normalizedAddress, results)

  return mapCw20BalanceResults(results, whitelist)
}

export const getCachedCw20Balances = (
  address: string | undefined,
  whitelist: Record<string, Cw20Token>
) => {
  if (!address || !Object.keys(whitelist).length) return undefined
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress) return undefined
  const payload = loadCachePayload(buildBalanceCacheKey(normalizedAddress, whitelist))
  const data: Record<string, string> = payload ? { ...payload.data } : {}

  loadActiveBalanceContracts(normalizedAddress).forEach((contract) => {
    if (!(contract in whitelist) || contract in data) return
    const cachedSingle = loadSingleBalanceCache(normalizedAddress, contract)
    if (cachedSingle) {
      data[contract] = cachedSingle.balance
    }
  })

  if (!payload && !Object.keys(data).length) {
    Object.keys(whitelist).forEach((contractRaw) => {
      const contract = normalizeContract(contractRaw)
      if (!contract || contract in data) return
      const cachedSingle = loadSingleBalanceCache(normalizedAddress, contract)
      if (cachedSingle) {
        data[contract] = cachedSingle.balance
      }
    })
  }

  if (!Object.keys(data).length) return undefined
  return {
    data: mapCw20BalanceResults(data, whitelist),
    updatedAt: payload?.ts ?? Date.now() - 1
  }
}

export const fetchCw20Balance = async (address: string, contract: string) => {
  const normalizedAddress = address.trim()
  const normalizedContract = contract.trim().toLowerCase()
  if (!normalizedAddress || !normalizedContract) return "0"

  const result = await fetchCw20BalanceResult(normalizedAddress, normalizedContract)
  if (!result) {
    throw new Error(`Failed to fetch CW20 balance for ${normalizedContract}`)
  }
  saveSingleBalanceCache(normalizedAddress, normalizedContract, result.balance)
  saveActiveBalanceContracts(normalizedAddress, {
    [normalizedContract]: result.balance
  })
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
  const cachedBalances = getCachedCw20Balances(address, whitelist ?? {})

  return useQuery({
    queryKey: ["cw20-balances", address, whitelistSignature, forceSignature],
    queryFn: () => fetchCw20Balances(address ?? "", whitelist ?? {}, options),
    enabled: Boolean(address && whitelist && Object.keys(whitelist).length),
    initialData: cachedBalances?.data,
    initialDataUpdatedAt: cachedBalances?.updatedAt,
    placeholderData: (previousData) => previousData,
    staleTime: forceSignature ? 30_000 : 2 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false
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
  const cached = loadCache(cacheKey, SUPPLY_CACHE_TTL) as Record<string, string> | undefined
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
