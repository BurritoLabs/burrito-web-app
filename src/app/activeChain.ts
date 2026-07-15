import {
  CHAIN_RUNTIME_CONFIG,
  type SupportedChainKey
} from "./config/chainConfig"

let activeAppChainKey: SupportedChainKey = "lunc"
let activeAppChainGeneration = 0

export const getActiveAppChainKey = () => activeAppChainKey

export const setActiveAppChainKey = (next: SupportedChainKey) => {
  if (activeAppChainKey === next) return
  activeAppChainKey = next
  activeAppChainGeneration += 1
}

export const getActiveAppChainGeneration = () => activeAppChainGeneration

export const getActiveAppChainRuntime = () =>
  CHAIN_RUNTIME_CONFIG[activeAppChainKey]
