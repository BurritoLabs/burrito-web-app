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
