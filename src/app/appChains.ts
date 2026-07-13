import {
  CHAIN_RUNTIME_CONFIG,
  type SupportedChainKey
} from "./config/chainConfig"

export type AppChainKey = SupportedChainKey

export type AppChainConfig = {
  key: AppChainKey
  name: string
  shortName: string
  symbol: string
  chainId: string
  nativeDenom: string
  displayDenom: string
  logoSrc: string
  accentRgb: string
  accent: string
  accentStrong: string
  accentSoft: string
  runtime: (typeof CHAIN_RUNTIME_CONFIG)[AppChainKey]
  features: {
    swap: boolean
    market: boolean
    launchpad: boolean
  }
}

export const APP_CHAIN_STORAGE_KEY = "burrito:web-app:chain"
export const DEFAULT_APP_CHAIN: AppChainKey = "lunc"

export const APP_CHAINS = {
  lunc: {
    key: "lunc",
    name: "Terra Classic",
    shortName: "Classic",
    symbol: "LUNC",
    chainId: "columbus-5",
    nativeDenom: "uluna",
    displayDenom: "LUNC",
    logoSrc: "/system/lunc.svg",
    accentRgb: "56, 189, 248",
    accent: "#38bdf8",
    accentStrong: "#0284c7",
    accentSoft: "#bae6fd",
    runtime: CHAIN_RUNTIME_CONFIG.lunc,
    features: { swap: true, market: true, launchpad: true }
  },
  luna: {
    key: "luna",
    name: "Terra",
    shortName: "Terra",
    symbol: "LUNA",
    chainId: "phoenix-1",
    nativeDenom: "uluna",
    displayDenom: "LUNA",
    logoSrc: "/system/luna.svg",
    accentRgb: "249, 115, 22",
    accent: "#f97316",
    accentStrong: "#ea580c",
    accentSoft: "#fed7aa",
    runtime: CHAIN_RUNTIME_CONFIG.luna,
    features: { swap: false, market: true, launchpad: false }
  }
} as const satisfies Record<AppChainKey, AppChainConfig>

export const SUPPORTED_APP_CHAINS = Object.values(APP_CHAINS)

export const isAppChainKey = (value: string): value is AppChainKey =>
  value === "lunc" || value === "luna"
