export const CLASSIC_CHAIN_CONFIG = {
  name: "Terra Classic",
  chainId: "columbus-5",
  rpc: "https://terra-classic-rpc.publicnode.com:443",
  lcd: "https://terra-classic-lcd.publicnode.com",
  fcd: "https://terra-classic-public-api.publicnode.com",
  bech32Prefix: "terra",
  coinType: 330
} as const

export const CLASSIC_DENOMS_CONFIG = {
  lunc: {
    coinDenom: "LUNC",
    coinMinimalDenom: "uluna",
    coinDecimals: 6,
    coinGeckoId: "terra-luna"
  },
  ustc: {
    coinDenom: "USTC",
    coinMinimalDenom: "uusd",
    coinDecimals: 6,
    coinGeckoId: "terrausd"
  }
} as const

export const CLASSIC_GAS_PRICE_STEP = {
  low: 28.325,
  average: 28.325,
  high: 50
} as const

export const CLASSIC_READ_ENDPOINTS_CONFIG = {
  lcd: [
    CLASSIC_CHAIN_CONFIG.lcd,
    "https://lcd.terra-classic.hexxagon.io",
    "https://api-lunc-lcd.binodes.com"
  ],
  rpc: [
    CLASSIC_CHAIN_CONFIG.rpc,
    "https://rpc.terra-classic.hexxagon.io",
    "https://api-lunc-rpc.binodes.com"
  ],
  fcd: [CLASSIC_CHAIN_CONFIG.fcd, "https://terra-classic-fcd.publicnode.com"]
} as const

export const LUNA_CHAIN_CONFIG = {
  name: "Terra",
  chainId: "phoenix-1",
  rpc: "https://terra-rpc.publicnode.com:443",
  lcd: "https://terra-lcd.publicnode.com",
  fcd: "https://phoenix-fcd.terra.dev",
  bech32Prefix: "terra",
  coinType: 330
} as const

export const LUNA_DENOMS_CONFIG = {
  luna: {
    coinDenom: "LUNA",
    coinMinimalDenom: "uluna",
    coinDecimals: 6,
    coinGeckoId: "terra-luna-2"
  }
} as const

export const LUNA_GAS_PRICE_STEP = {
  low: 0.015,
  average: 0.015,
  high: 0.04
} as const

export const LUNA_READ_ENDPOINTS_CONFIG = {
  lcd: [
    LUNA_CHAIN_CONFIG.lcd,
    "https://phoenix-lcd.terra.dev",
    "https://terra-rest.publicnode.com",
    "https://terra-api.chainroot.io"
  ],
  rpc: [
    LUNA_CHAIN_CONFIG.rpc,
    "https://terra-rpc.polkachu.com",
    "https://rpc.lavenderfive.com:443/terra2",
    "https://terra-rpc.stakely.io:443"
  ],
  fcd: [LUNA_CHAIN_CONFIG.fcd]
} as const

export type SupportedChainKey = "lunc" | "luna"

export const CHAIN_RUNTIME_CONFIG = {
  lunc: {
    key: "lunc",
    chain: CLASSIC_CHAIN_CONFIG,
    nativeDenom: CLASSIC_DENOMS_CONFIG.lunc,
    feeDenoms: [CLASSIC_DENOMS_CONFIG.lunc, CLASSIC_DENOMS_CONFIG.ustc],
    gasPriceStep: CLASSIC_GAS_PRICE_STEP,
    endpoints: CLASSIC_READ_ENDPOINTS_CONFIG,
    cosmosKitChainName: "terra"
  },
  luna: {
    key: "luna",
    chain: LUNA_CHAIN_CONFIG,
    nativeDenom: LUNA_DENOMS_CONFIG.luna,
    feeDenoms: [LUNA_DENOMS_CONFIG.luna],
    gasPriceStep: LUNA_GAS_PRICE_STEP,
    endpoints: LUNA_READ_ENDPOINTS_CONFIG,
    cosmosKitChainName: "terra2"
  }
} as const satisfies Record<
  SupportedChainKey,
  {
    key: SupportedChainKey
    chain: typeof CLASSIC_CHAIN_CONFIG | typeof LUNA_CHAIN_CONFIG
    nativeDenom:
      | typeof CLASSIC_DENOMS_CONFIG.lunc
      | typeof LUNA_DENOMS_CONFIG.luna
    feeDenoms: readonly (
      | typeof CLASSIC_DENOMS_CONFIG.lunc
      | typeof CLASSIC_DENOMS_CONFIG.ustc
      | typeof LUNA_DENOMS_CONFIG.luna
    )[]
    gasPriceStep: typeof CLASSIC_GAS_PRICE_STEP | typeof LUNA_GAS_PRICE_STEP
    endpoints:
      | typeof CLASSIC_READ_ENDPOINTS_CONFIG
      | typeof LUNA_READ_ENDPOINTS_CONFIG
    cosmosKitChainName: string
  }
>

export type ChainRuntimeConfig =
  (typeof CHAIN_RUNTIME_CONFIG)[SupportedChainKey]
