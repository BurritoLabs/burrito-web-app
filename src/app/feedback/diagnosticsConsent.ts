const STORAGE_KEY = "burrito:diagnostics-consent:v1"
const GRANTED = "granted"
const DENIED = "denied"
const listeners = new Set<() => void>()
let storageWindow: Window | undefined
let blockedForPage = false
let notifying = false
let notificationPending = false

const notify = () => {
  notificationPending = true
  if (notifying) return
  notifying = true
  try {
    while (notificationPending) {
      notificationPending = false
      for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue
        try {
          listener()
        } catch {
          // A subscriber must not prevent other collectors from stopping.
        }
      }
    }
  } finally {
    notifying = false
  }
}

const blockForPage = () => {
  if (blockedForPage) return
  blockedForPage = true
  notify()
}

export const getDiagnosticsConsent = (): boolean => {
  if (typeof window === "undefined" || blockedForPage) return false
  try {
    // Read at the point of use; no old or unknown value can imply consent.
    return window.localStorage.getItem(STORAGE_KEY) === GRANTED
  } catch {
    blockForPage()
    return false
  }
}

const handleStorage = (event: StorageEvent) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return
    // The event is only a notification. Subscribers re-read current storage;
    // delayed event.newValue must never revive a choice since withdrawn.
    getDiagnosticsConsent()
    notify()
  } catch {
    blockForPage()
  }
}

export const subscribeDiagnosticsConsent = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") return () => undefined
  const subscription = () => listener()
  listeners.add(subscription)
  if (!storageWindow) {
    storageWindow = window
    storageWindow.addEventListener("storage", handleStorage)
  }
  return () => {
    listeners.delete(subscription)
    if (listeners.size === 0 && storageWindow) {
      storageWindow.removeEventListener("storage", handleStorage)
      storageWindow = undefined
    }
  }
}

export const setDiagnosticsConsent = (enabled: boolean): boolean => {
  if (typeof window === "undefined") return false
  const value = enabled === true ? GRANTED : DENIED
  try {
    const storage = window.localStorage
    storage.setItem(STORAGE_KEY, value)
    if (storage.getItem(STORAGE_KEY) !== value) {
      blockForPage()
      return false
    }
    // Only an explicit, verified choice recovers a page after storage failure.
    blockedForPage = false
    notify()
    return true
  } catch {
    blockForPage()
    return false
  }
}
