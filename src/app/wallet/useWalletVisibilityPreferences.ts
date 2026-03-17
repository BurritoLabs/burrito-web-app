import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react"
import { CLASSIC_DENOMS } from "../chain"

const HIDE_LOW_BALANCE_KEY = "burritoHideLowBalance"
const LEGACY_HIDE_LOW_BALANCE_KEYS = [
  "burritoHideLowBalanceCoins",
  "burritoHideLowBalanceTokens"
]
const HIDDEN_TOKENS_KEY = "burritoHiddenTokens"
const VISIBILITY_PREFERENCE_EVENT = "burrito:wallet-visibility-preference"

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

  const stored = window.localStorage.getItem(key)
  if (stored !== null) return stored === "true"

  for (const fallbackKey of fallbackKeys) {
    const legacyValue = window.localStorage.getItem(fallbackKey)
    if (legacyValue !== null) return legacyValue === "true"
  }

  return fallback
}

const sanitizeHiddenTokens = (value: unknown) => {
  if (!Array.isArray(value)) return []

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.length > 0 && !ALWAYS_VISIBLE_DENOMS.has(item)
  )
}

const readStoredHiddenTokens = () => {
  if (!canUseWindow()) return []

  const stored = window.localStorage.getItem(HIDDEN_TOKENS_KEY)
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

    window.localStorage.setItem(storageKey, serializeValueRef.current(value))
    emitPreferenceChange(storageKey, sourceId)
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

export const useWalletHiddenTokensPreference = () =>
  useSyncedPreference<string[]>({
    storageKey: HIDDEN_TOKENS_KEY,
    readValue: readStoredHiddenTokens,
    serializeValue: (value) => JSON.stringify(sanitizeHiddenTokens(value))
  })
