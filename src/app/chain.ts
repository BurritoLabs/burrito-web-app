export const CLASSIC_CHAIN = {
  name: "Terra Classic",
  chainId: "columbus-5",
  rpc: "https://terra-classic-rpc.publicnode.com:443",
  lcd: "https://terra-classic-lcd.publicnode.com",
  fcd: "https://terra-classic-public-api.publicnode.com",
  bech32Prefix: "terra",
  coinType: 330
} as const

export const CLASSIC_DENOMS = {
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

const prefix = CLASSIC_CHAIN.bech32Prefix
const GAS_PRICE_STEP = {
  low: 28.325,
  average: 28.325,
  high: 50
}

export const KEPLR_CHAIN_CONFIG = {
  chainId: CLASSIC_CHAIN.chainId,
  chainName: CLASSIC_CHAIN.name,
  rpc: CLASSIC_CHAIN.rpc,
  rest: CLASSIC_CHAIN.lcd,
  bip44: {
    coinType: CLASSIC_CHAIN.coinType
  },
  bech32Config: {
    bech32PrefixAccAddr: prefix,
    bech32PrefixAccPub: `${prefix}pub`,
    bech32PrefixValAddr: `${prefix}valoper`,
    bech32PrefixValPub: `${prefix}valoperpub`,
    bech32PrefixConsAddr: `${prefix}valcons`,
    bech32PrefixConsPub: `${prefix}valconspub`
  },
  currencies: [CLASSIC_DENOMS.lunc, CLASSIC_DENOMS.ustc],
  feeCurrencies: [
    {
      ...CLASSIC_DENOMS.lunc,
      gasPriceStep: GAS_PRICE_STEP
    },
    {
      ...CLASSIC_DENOMS.ustc,
      gasPriceStep: GAS_PRICE_STEP
    }
  ],
  stakeCurrency: CLASSIC_DENOMS.lunc
}
