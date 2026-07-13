import type { AppChainKey } from "./appChains"

const explorerBase = (chainKey: AppChainKey) =>
  chainKey === "lunc"
    ? "https://finder.burrito.money/classic"
    : "https://www.mintscan.io/terra"

export const getTxExplorerUrl = (chainKey: AppChainKey, hash: string) =>
  `${explorerBase(chainKey)}/tx/${hash}`

export const getAddressExplorerUrl = (
  chainKey: AppChainKey,
  address: string
) =>
  `${explorerBase(chainKey)}/${chainKey === "lunc" ? "address" : "accounts"}/${address}`

export const getBlockExplorerUrl = (chainKey: AppChainKey, height: number) =>
  `${explorerBase(chainKey)}/${chainKey === "lunc" ? "blocks" : "block"}/${height}`
