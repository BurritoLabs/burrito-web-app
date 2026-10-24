import type { SupportedChainKey } from "../config/chainConfig"
import type { WalletConnectorId } from "./WalletContext"

// Keep connector metadata independent of the lazily loaded Cosmos Kit SDK.
export const COSMOS_KIT_CHAIN_NAME = "terra"

export const COSMOS_KIT_CHAIN_NAME_BY_KEY = {
  lunc: COSMOS_KIT_CHAIN_NAME,
  luna: "terra2"
} as const satisfies Record<SupportedChainKey, string>

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
