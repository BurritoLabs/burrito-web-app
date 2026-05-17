import {
  CLASSIC_CHAIN_CONFIG,
  CLASSIC_DENOMS_CONFIG,
  CLASSIC_GAS_PRICE_STEP
} from "./config/chainConfig"

export const CLASSIC_CHAIN = CLASSIC_CHAIN_CONFIG
export const CLASSIC_DENOMS = CLASSIC_DENOMS_CONFIG

const prefix = CLASSIC_CHAIN.bech32Prefix
const GAS_PRICE_STEP = CLASSIC_GAS_PRICE_STEP

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
