import {
  CHAIN_RUNTIME_CONFIG,
  CLASSIC_CHAIN_CONFIG,
  CLASSIC_DENOMS_CONFIG,
  CLASSIC_GAS_PRICE_STEP,
  LUNA_CHAIN_CONFIG,
  LUNA_DENOMS_CONFIG,
  LUNA_GAS_PRICE_STEP,
  type ChainRuntimeConfig,
  type SupportedChainKey
} from "./config/chainConfig"
import { getActiveAppChainRuntime } from "./activeChain"

// Compatibility bridge while feature modules migrate from Classic-specific
// imports to explicit runtime configuration.
export const CLASSIC_CHAIN = new Proxy(CLASSIC_CHAIN_CONFIG, {
  get: (_target, property) => {
    const active = getActiveAppChainRuntime().chain as unknown as Record<
      PropertyKey,
      unknown
    >
    return active[property]
  }
})

export const CLASSIC_DENOMS = new Proxy(CLASSIC_DENOMS_CONFIG, {
  get: (target, property) =>
    property === "lunc"
      ? getActiveAppChainRuntime().nativeDenom
      : target[property as keyof typeof target]
})
export const LUNA_CHAIN = LUNA_CHAIN_CONFIG
export const LUNA_DENOMS = LUNA_DENOMS_CONFIG

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

const createKeplrChainConfig = (runtime: ChainRuntimeConfig) => {
  const { chain, feeDenoms, gasPriceStep, nativeDenom } = runtime
  const prefix = chain.bech32Prefix

  return {
    chainId: chain.chainId,
    chainName: chain.name,
    rpc: chain.rpc,
    rest: chain.lcd,
    bip44: {
      coinType: chain.coinType
    },
    bech32Config: {
      bech32PrefixAccAddr: prefix,
      bech32PrefixAccPub: `${prefix}pub`,
      bech32PrefixValAddr: `${prefix}valoper`,
      bech32PrefixValPub: `${prefix}valoperpub`,
      bech32PrefixConsAddr: `${prefix}valcons`,
      bech32PrefixConsPub: `${prefix}valconspub`
    },
    currencies: [...feeDenoms],
    feeCurrencies: feeDenoms.map((denom) => ({
      ...denom,
      gasPriceStep
    })),
    stakeCurrency: nativeDenom
  }
}

export const LUNA_KEPLR_CHAIN_CONFIG = createKeplrChainConfig({
  ...CHAIN_RUNTIME_CONFIG.luna,
  gasPriceStep: LUNA_GAS_PRICE_STEP
})

export const getChainRuntimeConfig = (key: SupportedChainKey) =>
  CHAIN_RUNTIME_CONFIG[key]

export const getKeplrChainConfig = (key: SupportedChainKey) =>
  key === "lunc" ? KEPLR_CHAIN_CONFIG : LUNA_KEPLR_CHAIN_CONFIG
