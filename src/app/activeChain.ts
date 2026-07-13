import {
  CHAIN_RUNTIME_CONFIG,
  type SupportedChainKey
} from "./config/chainConfig"

let activeAppChainKey: SupportedChainKey = "lunc"

export const getActiveAppChainKey = () => activeAppChainKey

export const setActiveAppChainKey = (next: SupportedChainKey) => {
  activeAppChainKey = next
}

export const getActiveAppChainRuntime = () =>
  CHAIN_RUNTIME_CONFIG[activeAppChainKey]
