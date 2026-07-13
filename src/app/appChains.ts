export type AppChainKey = "lunc" | "luna"

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
    accentRgb: "82, 196, 26"
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
    accentRgb: "249, 115, 22"
  }
} as const satisfies Record<AppChainKey, AppChainConfig>

export const SUPPORTED_APP_CHAINS = Object.values(APP_CHAINS)

export const isAppChainKey = (value: string): value is AppChainKey =>
  value === "lunc" || value === "luna"
