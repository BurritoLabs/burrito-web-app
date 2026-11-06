import {
  BURRITO_REGISTRY_API_URL,
  COINPAPRIKA_LUNA_URL,
  COINPAPRIKA_LUNC_URL,
  COINPAPRIKA_USTC_URL
} from "../config/externalServices"

type PriceEntry = {
  usd: number
  usd_1h_change?: number
  usd_24h_change?: number
  usd_7d_change?: number
  usd_market_cap?: number
}
export type PriceMap = Partial<Record<"luna" | "lunc" | "ustc", PriceEntry>> & {
  _meta?: { asOf: number; stale: boolean }
}

const PRICE_CACHE_KEY = "burritoPriceCache"
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000
const PROVIDER_TIMEOUT_MS = 5_000
const keys = ["luna", "lunc", "ustc"] as const
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const priceEntry = (value: unknown): PriceEntry | undefined => {
  const row = record(value)
  const usd = finite(row.usd)
  // Missing/invalid quotes must remain unavailable, never appear as zero dollars.
  if (usd === undefined || usd <= 0) return undefined
  const marketCap = finite(row.usd_market_cap)
  return {
    usd,
    usd_1h_change: finite(row.usd_1h_change),
    usd_24h_change: finite(row.usd_24h_change),
    usd_7d_change: finite(row.usd_7d_change),
    usd_market_cap: marketCap !== undefined && marketCap >= 0 ? marketCap : undefined
  }
}

const priceMap = (value: unknown): PriceMap => {
  const source = record(value)
  const result: PriceMap = {}
  if (source._meta !== undefined) {
    const meta = record(source._meta)
    const asOf = finite(meta.asOf)
    // Server cache age is part of the data contract, not the HTTP arrival time.
    if (asOf === undefined || asOf <= 0 || asOf > Date.now() ||
      Date.now() - asOf >= PRICE_CACHE_TTL_MS || typeof meta.stale !== "boolean") return {}
    result._meta = { asOf, stale: meta.stale }
  }
  for (const key of keys) {
    const entry = priceEntry(source[key])
    if (entry) result[key] = entry
  }
  return result
}
const complete = (prices: PriceMap) => keys.every((key) => prices[key])

export const getCachedPrices = (): { ts: number; data: PriceMap } | undefined => {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(PRICE_CACHE_KEY)
    if (!raw) return undefined
    const parsed = record(JSON.parse(raw))
    const ts = finite(parsed.ts)
    const age = ts === undefined ? NaN : Date.now() - ts
    if (ts === undefined || age < 0 || age >= PRICE_CACHE_TTL_MS) return undefined
    const data = priceMap(parsed.data)
    // A partial cache must not suppress a new attempt to obtain missing assets.
    return complete(data) ? { ts: Math.min(ts, data._meta?.asOf ?? ts), data } : undefined
  } catch {
    // Restricted browser storage must not prevent a network price request.
    return undefined
  }
}

const setCachedPrices = (data: PriceMap) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ ts: data._meta?.asOf ?? Date.now(), data }))
  } catch {
    // Prices remain usable when storage is disabled or full.
  }
}

const requestJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Price request failed: ${response.status}`)
    // Keep the timeout alive while reading the response body, not just the headers.
    return await response.json()
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

const paprikaEntry = (value: unknown) => {
  const usd = record(record(record(value).quotes).USD)
  return priceEntry({
    usd: usd.price,
    usd_1h_change: usd.percent_change_1h,
    usd_24h_change: usd.percent_change_24h,
    usd_7d_change: usd.percent_change_7d,
    usd_market_cap: usd.market_cap
  })
}

const loadPrices = async (): Promise<PriceMap> => {
  const result: PriceMap = {}
  // Standard builds must still prefer our shared cache when no override is set.
  // The existing Vite proxy keeps localhost origins out of the production API.
  const service = BURRITO_REGISTRY_API_URL ||
    (import.meta.env.DEV ? "/burrito-api" : "https://api.burrito.money")
  try {
    Object.assign(result, priceMap(await requestJson(`${service}/v1/finder/prices`)))
  } catch { /* Continue with public providers. */ }
  if (complete(result)) {
    setCachedPrices(result)
    return result
  }

  const base = import.meta.env.DEV ? "/coingecko" : "https://api.coingecko.com/api/v3"
  const ids = "terra-luna-2,terra-luna,terraclassicusd,terrausd"
  const simpleUrl = `${base}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  const providers = [COINPAPRIKA_LUNA_URL, COINPAPRIKA_LUNC_URL, COINPAPRIKA_USTC_URL]
  const responses = await Promise.allSettled([
    ...keys.map((key, index) => result[key] ? Promise.resolve(undefined) : requestJson(providers[index])),
    requestJson(simpleUrl)
  ])
  const simpleResult = responses[3]
  const simple = record(simpleResult.status === "fulfilled" ? simpleResult.value : undefined)
  const simpleIds = ["terra-luna-2", "terra-luna", "terraclassicusd"]
  keys.forEach((key, index) => {
    if (result[key]) return
    const response = responses[index]
    const entry = paprikaEntry(response.status === "fulfilled" ? response.value : undefined)
      ?? priceEntry(simple[simpleIds[index]])
      ?? (key === "ustc" ? priceEntry(simple.terrausd) : undefined)
    if (entry) result[key] = entry
  })

  if (!complete(result)) {
    try {
      const rows = await requestJson(`${base}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=1h,24h,7d&sparkline=false`)
      const byId = new Map((Array.isArray(rows) ? rows : []).map((row: unknown) => [record(row).id, record(row)]))
      keys.forEach((key, index) => {
        if (result[key]) return
        const row = byId.get(simpleIds[index]) ?? (key === "ustc" ? byId.get("terrausd") : undefined)
        const entry = priceEntry({
          usd: row?.current_price,
          usd_1h_change: row?.price_change_percentage_1h_in_currency,
          usd_24h_change: row?.price_change_percentage_24h,
          usd_7d_change: row?.price_change_percentage_7d_in_currency,
          usd_market_cap: row?.market_cap
        })
        if (entry) result[key] = entry
      })
    } catch { /* Keep any valid fresh provider results. */ }
  }
  if (!keys.some((key) => result[key])) throw new Error("Current prices are unavailable")
  // Never combine expired prices with fresh ones or renew the old cache timestamp.
  setCachedPrices(result)
  return result
}

let pending: Promise<PriceMap> | undefined
// Explicit retries bypass local storage, while still sharing concurrent requests.
export const refreshPrices = (): Promise<PriceMap> => {
  if (!pending) pending = loadPrices().finally(() => { pending = undefined })
  return pending
}

export const fetchPrices = (): Promise<PriceMap> => {
  const cached = getCachedPrices()
  if (cached && !cached.data._meta?.stale) return Promise.resolve(cached.data)
  // Both chains use the same global USD prices but have different React Query keys.
  return refreshPrices()
}
