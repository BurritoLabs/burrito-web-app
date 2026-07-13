import type { AssetList, Chain } from "@chain-registry/types"
import type { MainWalletBase, WalletConnectOptions } from "@cosmos-kit/core"
import { wallets as keplrMobileWallets } from "@cosmos-kit/keplr-mobile"
import {
  CHAIN_RUNTIME_CONFIG,
  type ChainRuntimeConfig,
  type SupportedChainKey
} from "../config/chainConfig"
import {
  getBurritoAppOrigin,
  WALLETCONNECT_PROJECT_ID,
  warnIfDefaultWalletConnectProjectId
} from "../config/walletConfig"
import type { WalletConnectorId } from "./WalletContext"

export const COSMOS_KIT_CHAIN_NAME = "terra"

export const COSMOS_KIT_CHAIN_NAME_BY_KEY = {
  lunc: COSMOS_KIT_CHAIN_NAME,
  luna: "terra2"
} as const satisfies Record<SupportedChainKey, string>

const createCosmosKitChain = (runtime: ChainRuntimeConfig): Chain => ({
  chain_name: runtime.cosmosKitChainName,
  chain_type: "cosmos",
  chain_id: runtime.chain.chainId,
  pretty_name: runtime.chain.name,
  status: "live",
  network_type: "mainnet",
  bech32_prefix: runtime.chain.bech32Prefix,
  daemon_name: "terrad",
  node_home: "$HOME/.terra",
  key_algos: ["secp256k1"],
  slip44: runtime.chain.coinType,
  fees: {
    fee_tokens: runtime.feeDenoms.map((denom) => ({
      denom: denom.coinMinimalDenom,
      fixed_min_gas_price: runtime.gasPriceStep.average,
      low_gas_price: runtime.gasPriceStep.low,
      average_gas_price: runtime.gasPriceStep.average,
      high_gas_price: runtime.gasPriceStep.high
    }))
  },
  staking: {
    staking_tokens: [{ denom: runtime.nativeDenom.coinMinimalDenom }]
  },
  codebase: {
    binaries: {},
    sdk: {
      type: "cosmos"
    },
    consensus: {
      type: "tendermint"
    }
  },
  apis: {
    rpc: runtime.endpoints.rpc.map((address, index) => ({
      address,
      provider: index === 0 ? "primary" : "burrito-fallback"
    })),
    rest: runtime.endpoints.lcd.map((address, index) => ({
      address,
      provider: index === 0 ? "primary" : "burrito-fallback"
    }))
  }
})

const createAsset = (
  runtime: ChainRuntimeConfig,
  denom: {
    coinDenom: string
    coinMinimalDenom: string
    coinDecimals: number
    coinGeckoId: string
  },
  logo: string
) => ({
  type_asset: "sdk.coin" as const,
  base: denom.coinMinimalDenom,
  name: denom.coinDenom,
  display: denom.coinDenom,
  symbol: denom.coinDenom,
  denom_units: [
    {
      denom: denom.coinMinimalDenom,
      exponent: 0
    },
    {
      denom: denom.coinDenom,
      exponent: denom.coinDecimals
    }
  ],
  logo_URIs: {
    svg: logo
  },
  coingecko_id: denom.coinGeckoId,
  keywords: [runtime.chain.chainId]
})

const createCosmosKitAssetList = (runtime: ChainRuntimeConfig): AssetList => ({
  chain_name: runtime.cosmosKitChainName,
  assets: runtime.feeDenoms.map((denom) =>
    createAsset(
      runtime,
      denom,
      denom.coinDenom === "USTC"
        ? "/system/ustc.svg"
        : runtime.key === "lunc"
          ? "/system/lunc.svg"
          : "/system/luna.svg"
    )
  )
})

export const COSMOS_KIT_CHAIN = createCosmosKitChain(CHAIN_RUNTIME_CONFIG.lunc)
export const COSMOS_KIT_LUNA_CHAIN = createCosmosKitChain(CHAIN_RUNTIME_CONFIG.luna)
export const COSMOS_KIT_ASSET_LIST = createCosmosKitAssetList(
  CHAIN_RUNTIME_CONFIG.lunc
)
export const COSMOS_KIT_LUNA_ASSET_LIST = createCosmosKitAssetList(
  CHAIN_RUNTIME_CONFIG.luna
)

export const COSMOS_KIT_WALLETS: MainWalletBase[] = [...keplrMobileWallets]

export const COSMOS_KIT_CHAINS = [COSMOS_KIT_CHAIN, COSMOS_KIT_LUNA_CHAIN]
export const COSMOS_KIT_ASSET_LISTS = [
  COSMOS_KIT_ASSET_LIST,
  COSMOS_KIT_LUNA_ASSET_LIST
]

export const COSMOS_CONNECTOR_CONFIGS: Record<
  "keplr" | "keplr-mobile",
  {
    id: "keplr" | "keplr-mobile"
    label: string
    badge: string
    walletName: string
    type: "extension" | "mobile"
  }
> = {
  keplr: {
    id: "keplr",
    label: "Keplr",
    badge: "K",
    walletName: "keplr-extension",
    type: "extension"
  },
  "keplr-mobile": {
    id: "keplr-mobile",
    label: "Keplr Mobile",
    badge: "K",
    walletName: "keplr-mobile",
    type: "mobile"
  }
}

export const COSMOS_CONNECTOR_IDS = Object.keys(
  COSMOS_CONNECTOR_CONFIGS
) as Array<keyof typeof COSMOS_CONNECTOR_CONFIGS>

export const isCosmosConnectorId = (
  connectorId: WalletConnectorId | undefined
): connectorId is keyof typeof COSMOS_CONNECTOR_CONFIGS =>
  Boolean(connectorId && connectorId in COSMOS_CONNECTOR_CONFIGS)

export const COSMOS_WALLET_NAME_TO_CONNECTOR_ID = Object.values(
  COSMOS_CONNECTOR_CONFIGS
).reduce<Record<string, keyof typeof COSMOS_CONNECTOR_CONFIGS>>(
  (result, config) => {
    result[config.walletName] = config.id
    return result
  },
  {}
)

export const getWalletConnectOptions = (): WalletConnectOptions => {
  warnIfDefaultWalletConnectProjectId()
  const origin = getBurritoAppOrigin()
  return {
    signClient: {
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "Burrito",
        description:
          "Burrito wallet, staking, governance, and contracts for Terra and Terra Classic.",
        url: origin,
        icons: [`${origin}/apple-touch-icon.png`]
      }
    }
  }
}
