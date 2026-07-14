import type {
  AppChainConfig,
  AppChainKey
} from "../appChains"

export type ChainFeature = keyof AppChainConfig["features"]

type FeatureChain = Pick<AppChainConfig, "features" | "key" | "name">

export const findAlternativeChainForFeature = (
  chains: readonly FeatureChain[],
  currentChainKey: AppChainKey,
  feature: ChainFeature
) =>
  chains.find(
    (candidate) =>
      candidate.key !== currentChainKey && candidate.features[feature]
  )
