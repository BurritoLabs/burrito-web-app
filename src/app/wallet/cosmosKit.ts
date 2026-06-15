import type { AssetList, Chain } from "@chain-registry/types"
import type { MainWalletBase, WalletConnectOptions } from "@cosmos-kit/core"
import { wallets as keplrMobileWallets } from "@cosmos-kit/keplr-mobile"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import { CLASSIC_READ_ENDPOINTS_CONFIG } from "../config/chainConfig"
import {
  getBurritoAppOrigin,
  WALLETCONNECT_PROJECT_ID,
  warnIfDefaultWalletConnectProjectId
} from "../config/walletConfig"
import type { WalletConnectorId } from "./WalletContext"

export const COSMOS_KIT_CHAIN_NAME = "terra"

const GAS_PRICE_STEP = {
  low: 28.325,
  average: 28.325,
  high: 50
} as const

export const COSMOS_KIT_CHAIN: Chain = {
  chain_name: COSMOS_KIT_CHAIN_NAME,
  chain_type: "cosmos",
  chain_id: CLASSIC_CHAIN.chainId,
  pretty_name: CLASSIC_CHAIN.name,
  status: "live",
  network_type: "mainnet",
  bech32_prefix: CLASSIC_CHAIN.bech32Prefix,
  daemon_name: "terrad",
  node_home: "$HOME/.terra",
  key_algos: ["secp256k1"],
  slip44: CLASSIC_CHAIN.coinType,
  fees: {
    fee_tokens: [
      {
        denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        fixed_min_gas_price: GAS_PRICE_STEP.average,
        low_gas_price: GAS_PRICE_STEP.low,
        average_gas_price: GAS_PRICE_STEP.average,
        high_gas_price: GAS_PRICE_STEP.high
      },
      {
        denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
        fixed_min_gas_price: GAS_PRICE_STEP.average,
        low_gas_price: GAS_PRICE_STEP.low,
        average_gas_price: GAS_PRICE_STEP.average,
        high_gas_price: GAS_PRICE_STEP.high
      }
    ]
  },
  staking: {
    staking_tokens: [{ denom: CLASSIC_DENOMS.lunc.coinMinimalDenom }]
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
    rpc: CLASSIC_READ_ENDPOINTS_CONFIG.rpc.map((address, index) => ({
      address,
      provider: index === 0 ? "publicnode" : "burrito-fallback"
    })),
    rest: CLASSIC_READ_ENDPOINTS_CONFIG.lcd.map((address, index) => ({
      address,
      provider: index === 0 ? "publicnode" : "burrito-fallback"
    }))
  }
}

export const COSMOS_KIT_ASSET_LIST: AssetList = {
  chain_name: COSMOS_KIT_CHAIN_NAME,
  assets: [
    {
      type_asset: "sdk.coin",
      base: CLASSIC_DENOMS.lunc.coinMinimalDenom,
      name: CLASSIC_DENOMS.lunc.coinDenom,
      display: CLASSIC_DENOMS.lunc.coinDenom,
      symbol: CLASSIC_DENOMS.lunc.coinDenom,
      denom_units: [
        {
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          exponent: 0
        },
        {
          denom: CLASSIC_DENOMS.lunc.coinDenom,
          exponent: CLASSIC_DENOMS.lunc.coinDecimals
        }
      ],
      logo_URIs: {
        svg: "/system/lunc.svg"
      },
      coingecko_id: CLASSIC_DENOMS.lunc.coinGeckoId
    },
    {
      type_asset: "sdk.coin",
      base: CLASSIC_DENOMS.ustc.coinMinimalDenom,
      name: CLASSIC_DENOMS.ustc.coinDenom,
      display: CLASSIC_DENOMS.ustc.coinDenom,
      symbol: CLASSIC_DENOMS.ustc.coinDenom,
      denom_units: [
        {
          denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
          exponent: 0
        },
        {
          denom: CLASSIC_DENOMS.ustc.coinDenom,
          exponent: CLASSIC_DENOMS.ustc.coinDecimals
        }
      ],
      logo_URIs: {
        svg: "/system/ustc.svg"
      },
      coingecko_id: CLASSIC_DENOMS.ustc.coinGeckoId
    }
  ]
}

export const COSMOS_KIT_WALLETS: MainWalletBase[] = [...keplrMobileWallets]

export const COSMOS_KIT_CHAINS = [COSMOS_KIT_CHAIN]
export const COSMOS_KIT_ASSET_LISTS = [COSMOS_KIT_ASSET_LIST]

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
          "Burrito Terra Classic wallet, swap, market, governance, and contracts.",
        url: origin,
        icons: [`${origin}/apple-touch-icon.png`]
      }
    }
  }
}
