import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"
import type { Cw20Token } from "./terraAssets"

export type Cw20Balance = Cw20Token & {
  address: string
  balance: string
}

const CACHE_TTL = 5 * 60 * 1000

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
  window.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
}

export const fetchCw20Balances = async (
  address: string,
  whitelist: Record<string, Cw20Token>
) => {
  if (!address) return []

  const cacheKey = `cw20balance:${address}:classic`
  const invalidKey = "cw20invalid:classic"
  const cached = loadCache(cacheKey)
  const invalidCached = loadCache(invalidKey) as Record<string, string> | undefined
  const invalidContracts: Record<string, boolean> = {}

  if (invalidCached) {
    Object.keys(invalidCached).forEach((key) => {
      invalidContracts[key] = true
    })
  }

  if (cached) {
    return Object.entries(cached).map(([token, balance]) => ({
      ...whitelist[token],
      address: token,
      balance
    }))
  }

  const entries = Object.entries(whitelist).filter(
    ([contract]) => !invalidContracts[contract]
  )

  const results: Record<string, string> = {}
  const limit = 4
  let index = 0

  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (index < entries.length) {
      const current = index
      index += 1
      const [contract] = entries[current]
      try {
        const query = btoa(JSON.stringify({ balance: { address } }))
        const res = await fetch(
          `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`
        )
        if (!res.ok) {
          const message = await res.text()
          if (message.includes("no such contract")) {
            invalidContracts[contract] = true
          }
          results[contract] = "0"
          continue
        }
        const data = (await res.json()) as { data?: { balance?: string } }
        results[contract] = data?.data?.balance ?? "0"
      } catch (error: any) {
        const message = String(error?.message ?? "")
        if (message.includes("no such contract")) {
          invalidContracts[contract] = true
        }
        results[contract] = "0"
      }
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

export const useCw20Balances = (
  address: string | undefined,
  whitelist?: Record<string, Cw20Token>
) => {
  return useQuery({
    queryKey: ["cw20-balances", address],
    queryFn: () => fetchCw20Balances(address ?? "", whitelist ?? {}),
    enabled: Boolean(address && whitelist && Object.keys(whitelist).length),
    staleTime: 60_000
  })
}
