import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react"
import { CLASSIC_DENOMS } from "../chain"
import { useAppChain } from "../appChainContext"
import {
  readLocalStorageValue,
  writeLocalStorageValue
} from "../utils/safeStorage"

const HIDE_LOW_BALANCE_KEY = "burritoHideLowBalance"
const LEGACY_HIDE_LOW_BALANCE_KEYS = [
  "burritoHideLowBalanceCoins",
  "burritoHideLowBalanceTokens"
]
const LEGACY_HIDDEN_TOKENS_KEY = "burritoHiddenTokens"
const VISIBILITY_PREFERENCE_EVENT = "burrito:wallet-visibility-preference"
const MAX_HIDDEN_TOKENS = 1_000

type WalletVisibilityPreferenceEventDetail = {
  key: string
  sourceId: string
}

const ALWAYS_VISIBLE_DENOMS: Set<string> = new Set([
  CLASSIC_DENOMS.lunc.coinMinimalDenom,
  CLASSIC_DENOMS.ustc.coinMinimalDenom
])

const canUseWindow = () => typeof window !== "undefined"

const readStoredBoolean = (key: string, fallback: boolean, fallbackKeys: string[] = []) => {
  if (!canUseWindow()) return fallback

  const stored = readLocalStorageValue(key)
  if (stored !== null) return stored === "true"

  for (const fallbackKey of fallbackKeys) {
    const legacyValue = readLocalStorageValue(fallbackKey)
    if (legacyValue !== null) return legacyValue === "true"
  }

  return fallback
}

export const sanitizeHiddenTokens = (value: unknown) => {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string") continue
    const normalized = item.trim()
    if (
      !normalized ||
      normalized.length > 256 ||
      ALWAYS_VISIBLE_DENOMS.has(normalized.toLowerCase()) ||
      seen.has(normalized)
    ) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= MAX_HIDDEN_TOKENS) break
  }
  return result
}

export const getHiddenTokensStorageKey = (chainId: string) =>
  `burritoHiddenTokens:${chainId}`

const readStoredHiddenTokens = (
  storageKey: string,
  legacyStorageKey?: string
) => {
  if (!canUseWindow()) return []

  const stored =
    readLocalStorageValue(storageKey) ??
    (legacyStorageKey
      ? readLocalStorageValue(legacyStorageKey)
      : null)
  if (!stored) return []

  try {
    return sanitizeHiddenTokens(JSON.parse(stored))
  } catch {
    return []
  }
}

const emitPreferenceChange = (key: string, sourceId: string) => {
  if (!canUseWindow()) return

  window.dispatchEvent(
    new CustomEvent<WalletVisibilityPreferenceEventDetail>(
      VISIBILITY_PREFERENCE_EVENT,
      { detail: { key, sourceId } }
    )
  )
}

const useSyncedPreference = <T,>({
  storageKey,
  readValue,
  serializeValue
}: {
  storageKey: string
  readValue: () => T
  serializeValue: (value: T) => string
}): [T, Dispatch<SetStateAction<T>>] => {
  const sourceId = useId()
  const [value, setValue] = useState<T>(() => readValue())
  const valueRef = useRef(value)
  const storageKeyRef = useRef(storageKey)
  const readValueRef = useRef(readValue)
  const serializeValueRef = useRef(serializeValue)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    readValueRef.current = readValue
  }, [readValue])

  useEffect(() => {
    serializeValueRef.current = serializeValue
  }, [serializeValue])

  useEffect(() => {
    if (!canUseWindow()) return

    if (storageKeyRef.current !== storageKey) {
      storageKeyRef.current = storageKey
      const nextValue = readValueRef.current()
      valueRef.current = nextValue
      setValue(nextValue)
      const stored = writeLocalStorageValue(
        storageKey,
        serializeValueRef.current(nextValue)
      )
      if (stored) emitPreferenceChange(storageKey, sourceId)
      return
    }

    const stored = writeLocalStorageValue(
      storageKey,
      serializeValueRef.current(value)
    )
    if (stored) emitPreferenceChange(storageKey, sourceId)
  }, [sourceId, storageKey, value])

  useEffect(() => {
    if (!canUseWindow()) return

    const sync = () => {
      const nextValue = readValueRef.current()
      if (
        serializeValueRef.current(nextValue) ===
        serializeValueRef.current(valueRef.current)
      ) {
        return
      }
      setValue(nextValue)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return
      sync()
    }

    const handlePreferenceChange = (event: Event) => {
      const detail = (
        event as CustomEvent<WalletVisibilityPreferenceEventDetail>
      ).detail
      if (!detail || detail.sourceId === sourceId || detail.key !== storageKey) {
        return
      }
      sync()
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(
      VISIBILITY_PREFERENCE_EVENT,
      handlePreferenceChange as EventListener
    )

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(
        VISIBILITY_PREFERENCE_EVENT,
        handlePreferenceChange as EventListener
      )
    }
  }, [sourceId, storageKey])

  return [value, setValue]
}

export const useWalletHideLowBalancePreference = () =>
  useSyncedPreference<boolean>({
    storageKey: HIDE_LOW_BALANCE_KEY,
    readValue: () =>
      readStoredBoolean(
        HIDE_LOW_BALANCE_KEY,
        true,
        LEGACY_HIDE_LOW_BALANCE_KEYS
      ),
    serializeValue: (value) => String(value)
  })

export const useWalletHiddenTokensPreference = () => {
  const { chainKey, chain } = useAppChain()
  const storageKey = getHiddenTokensStorageKey(chain.chainId)

  return useSyncedPreference<string[]>({
    storageKey,
    readValue: () =>
      readStoredHiddenTokens(
        storageKey,
        chainKey === "lunc" ? LEGACY_HIDDEN_TOKENS_KEY : undefined
      ),
    serializeValue: (value) => JSON.stringify(sanitizeHiddenTokens(value))
  })
}
