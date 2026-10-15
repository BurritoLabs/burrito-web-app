import type {
  WalletConnector,
  WalletConnectorId
} from "./WalletContext"

export const WALLET_CONNECTOR_STORAGE_KEY = "burritoWalletConnector"
export const WALLET_MANUAL_DISCONNECT_STORAGE_KEY =
  "burritoWalletManuallyDisconnected"
const COSMOS_KIT_STORAGE_KEYS = [
  "cosmos-kit@2:core//accounts",
  "cosmos-kit@2:core//current-wallet"
] as const

export const KNOWN_CONNECTOR_IDS: WalletConnectorId[] = [
  "burrito-native",
  "burrito-extension",
  "keplr",
  "keplr-mobile",
  "galaxy"
]

type WalletAdapterMeta = {
  id: WalletConnectorId
  label: string
  badge: string
  type: WalletConnector["type"]
}

export const CONNECTOR_META: Record<WalletConnectorId, WalletAdapterMeta> = {
  "burrito-native": {
    id: "burrito-native",
    label: "Burrito Wallet",
    badge: "B",
    type: "mobile"
  },
  "burrito-extension": {
    id: "burrito-extension",
    label: "Burrito Wallet",
    badge: "B",
    type: "extension"
  },
  keplr: {
    id: "keplr",
    label: "Keplr",
    badge: "K",
    type: "extension"
  },
  "keplr-mobile": {
    id: "keplr-mobile",
    label: "Keplr Mobile",
    badge: "K",
    type: "mobile"
  },
  galaxy: {
    id: "galaxy",
    label: "Galaxy Station",
    badge: "G",
    type: "extension"
  }
}

export const isKnownWalletConnectorId = (
  value: string | null | undefined
): value is WalletConnectorId =>
  Boolean(value && KNOWN_CONNECTOR_IDS.includes(value as WalletConnectorId))

export const getStoredWalletConnectorId = () => {
  if (typeof window === "undefined") return undefined
  try {
    if (isWalletManualDisconnectStored()) return undefined
    const stored = window.localStorage.getItem(WALLET_CONNECTOR_STORAGE_KEY)
    return isKnownWalletConnectorId(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

export const isWalletManualDisconnectStored = () => {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(WALLET_MANUAL_DISCONNECT_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export const rememberWalletManualDisconnect = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(WALLET_MANUAL_DISCONNECT_STORAGE_KEY, "true")
  } catch {
    // Storage can be unavailable in private or restricted mobile browsers.
  }
}

export const clearWalletManualDisconnect = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(WALLET_MANUAL_DISCONNECT_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private or restricted mobile browsers.
  }
}

export const rememberWalletConnectorId = (id: WalletConnectorId) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(WALLET_MANUAL_DISCONNECT_STORAGE_KEY)
    window.localStorage.setItem(WALLET_CONNECTOR_STORAGE_KEY, id)
  } catch {
    // Storage can be unavailable in private or restricted mobile browsers.
  }
}

export const forgetStoredWalletConnectorId = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(WALLET_CONNECTOR_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private or restricted mobile browsers.
  }
}

export const forgetStoredWalletSession = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(WALLET_CONNECTOR_STORAGE_KEY)
    COSMOS_KIT_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Storage can be unavailable in private or restricted mobile browsers.
  }
}

export const getWalletConnectorMeta = (id: WalletConnectorId) =>
  CONNECTOR_META[id]

export const getWalletConnectorLabel = (id?: WalletConnectorId) =>
  id ? getWalletConnectorMeta(id).label : "Wallet"

export const getWalletConnectorBadge = (id?: WalletConnectorId) =>
  id ? getWalletConnectorMeta(id).badge : "W"
