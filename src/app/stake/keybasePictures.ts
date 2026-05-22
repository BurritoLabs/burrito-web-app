export const KEYBASE_FETCH_CONCURRENCY = 4
export const DEFAULT_VALIDATOR_LOGO = "/system/validator.png"

const KEYBASE_CACHE_STORAGE_KEY = "burrito:keybase-pictures:v1"
const KEYBASE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14

export type KeybasePictureCacheEntry = {
  url: string
  updatedAt: number
}

export type KeybasePictureCacheStore = Record<
  string,
  KeybasePictureCacheEntry
>

const pruneKeybaseCacheStore = (
  store: KeybasePictureCacheStore
): KeybasePictureCacheStore => {
  const cutoff = Date.now() - KEYBASE_CACHE_TTL_MS
  const next: KeybasePictureCacheStore = {}
  Object.entries(store).forEach(([identity, entry]) => {
    if (!entry?.url) return
    if (typeof entry.updatedAt !== "number" || entry.updatedAt < cutoff) return
    next[identity] = entry
  })
  return next
}

export const readKeybaseCacheStore = (): KeybasePictureCacheStore => {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(KEYBASE_CACHE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as KeybasePictureCacheStore
    return pruneKeybaseCacheStore(parsed ?? {})
  } catch {
    return {}
  }
}

export const writeKeybaseCacheStore = (store: KeybasePictureCacheStore) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      KEYBASE_CACHE_STORAGE_KEY,
      JSON.stringify(pruneKeybaseCacheStore(store))
    )
  } catch {
    // Ignore storage limits and private mode restrictions.
  }
}

export const cacheStoreToPictureMap = (store: KeybasePictureCacheStore) => {
  const map: Record<string, string> = {}
  Object.entries(store).forEach(([identity, entry]) => {
    if (entry?.url) map[identity] = entry.url
  })
  return map
}
