const VOLATILE_CACHE_KEY_PREFIXES = [
  "cw20balance:",
  "cw20balance-single:",
  "cw20balance-active:",
  "cw20supply:",
  "cw20supply-token:",
  "burritoDashboardSnapshot:",
  "burritoDashboardTxCounts:",
  "burritoDashboardTxFees:"
] as const

const VOLATILE_CACHE_KEYS = new Set([
  "burritoIbcTraceCacheV3",
  "burritoNativeTokenCacheV2",
  "burritoCw20TokenInfoCacheV2",
  "burritoPriceCache",
  "burritoFxCache"
])

const getLocalStorage = () => {
  if (typeof window === "undefined") return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const isVolatileCacheKey = (key: string) =>
  VOLATILE_CACHE_KEYS.has(key) ||
  VOLATILE_CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))

export const clearVolatileStorageCaches = (storage = getLocalStorage()) => {
  if (!storage) return 0
  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && isVolatileCacheKey(key)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
    return keys.length
  } catch {
    return 0
  }
}

export const readLocalStorageValue = (key: string) => {
  try {
    return getLocalStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export const writeLocalStorageValue = (key: string, value: string) => {
  const storage = getLocalStorage()
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    clearVolatileStorageCaches(storage)
    try {
      storage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
}

export const removeLocalStorageValue = (key: string) => {
  try {
    getLocalStorage()?.removeItem(key)
  } catch {
    // Restricted browsers may not expose writable storage.
  }
}
