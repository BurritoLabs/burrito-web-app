import { useQuery } from "@tanstack/react-query"
import { CLASSIC_CHAIN } from "../chain"

const ASSET_URL = "https://assets.terra.dev"

export type Cw20Token = {
  protocol?: string
  symbol: string
  token: string
  icon?: string
  decimals?: number
  name?: string
}

export type IbcToken = {
  denom: string
  base_denom: string
  symbol: string
  name: string
  icon: string
  decimals?: number
  path?: string
}

export const fetchAsset = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${ASSET_URL}/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}`)
  return res.json() as Promise<T>
}

export const pickChainAssets = <T,>(
  data: Record<string, T> | undefined,
  name: string,
  chainId: string
) => {
  if (!data) return undefined
  if (data[name]) return data[name]
  if (data[chainId]) return data[chainId]
  const loweredName = name.toLowerCase()
  const loweredChain = chainId.toLowerCase()
  const match = Object.keys(data).find(
    (key) => key.toLowerCase() === loweredName || key.toLowerCase() === loweredChain
  )
  if (match) return data[match]
  return (
    data.classic ??
    data["columbus-5"] ??
    data.mainnet ??
    data["phoenix-1"]
  )
}

export type Cw20Contract = {
  protocol?: string
  name?: string
  icon?: string
}

export const useCw20Whitelist = () => {
  return useQuery({
    queryKey: ["terra-assets", "cw20", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, Cw20Token>>>(
        "cw20/tokens.json"
      )
      return (
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      )
    },
    staleTime: 60 * 60 * 1000
  })
}

export const useIbcWhitelist = () => {
  return useQuery({
    queryKey: ["terra-assets", "ibc", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, IbcToken>>>(
        "ibc/tokens.json"
      )
      return (
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      )
    },
    staleTime: 60 * 60 * 1000
  })
}

export const useCw20Contracts = () => {
  return useQuery({
    queryKey: ["terra-assets", "cw20-contracts", CLASSIC_CHAIN.chainId],
    queryFn: async () => {
      const data = await fetchAsset<Record<string, Record<string, Cw20Contract>>>(
        "cw20/contracts.json"
      )
      return (
        pickChainAssets(data, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}
      )
    },
    staleTime: 60 * 60 * 1000
  })
}
