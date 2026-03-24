import type { AssetList, Chain } from "@chain-registry/types"
import type { MainWalletBase, WalletConnectOptions } from "@cosmos-kit/core"
import { wallets as keplrWallets } from "@cosmos-kit/keplr"
import { wallets as leapWallets } from "@cosmos-kit/leap"
import { wallets as trustWallets } from "@cosmos-kit/trust"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import type { WalletConnectorId } from "./WalletContext"

export const COSMOS_KIT_CHAIN_NAME = "terra"

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ||
  "e95bf03729cf2be3b408afc97030b40f"

const getAppOrigin = () =>
  typeof window !== "undefined" ? window.location.origin : "https://app.burrito.money"

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
    rpc: [{ address: CLASSIC_CHAIN.rpc, provider: "publicnode" }],
    rest: [{ address: CLASSIC_CHAIN.lcd, provider: "publicnode" }]
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

export const COSMOS_KIT_WALLETS: MainWalletBase[] = [
  ...keplrWallets,
  ...leapWallets,
  ...trustWallets
]

export const COSMOS_KIT_CHAINS = [COSMOS_KIT_CHAIN]
export const COSMOS_KIT_ASSET_LISTS = [COSMOS_KIT_ASSET_LIST]

export const COSMOS_CONNECTOR_CONFIGS: Record<
  "keplr" | "leap" | "trust",
  {
    id: "keplr" | "leap" | "trust"
    label: string
    badge: string
    extensionWalletName: string
    mobileWalletName: string
  }
> = {
  keplr: {
    id: "keplr",
    label: "Keplr",
    badge: "K",
    extensionWalletName: "keplr-extension",
    mobileWalletName: "keplr-mobile"
  },
  leap: {
    id: "leap",
    label: "Leap",
    badge: "L",
    extensionWalletName: "leap-extension",
    mobileWalletName: "leap-cosmos-mobile"
  },
  trust: {
    id: "trust",
    label: "Trust Wallet",
    badge: "T",
    extensionWalletName: "trust-extension",
    mobileWalletName: "trust-mobile"
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
    result[config.extensionWalletName] = config.id
    result[config.mobileWalletName] = config.id
    return result
  },
  {}
)

export const getWalletConnectOptions = (): WalletConnectOptions => {
  const origin = getAppOrigin()
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
