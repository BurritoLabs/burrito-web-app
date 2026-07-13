import type { AppChainKey } from "./appChains"

const explorerBase = (chainKey: AppChainKey) =>
  `https://finder.burrito.money/${chainKey === "lunc" ? "classic" : "mainnet"}`

export const getTxExplorerUrl = (chainKey: AppChainKey, hash: string) =>
  `${explorerBase(chainKey)}/tx/${hash}`

export const getAddressExplorerUrl = (
  chainKey: AppChainKey,
  address: string
) =>
  `${explorerBase(chainKey)}/address/${address}`

export const getBlockExplorerUrl = (chainKey: AppChainKey, height: number) =>
  `${explorerBase(chainKey)}/blocks/${height}`

export const getValidatorExplorerUrl = (
  chainKey: AppChainKey,
  address: string
) => `${explorerBase(chainKey)}/validator/${address}`
