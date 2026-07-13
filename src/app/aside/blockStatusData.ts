import { fetchWithEndpointFallback } from "../data/endpointFallback"

export type LatestBlock = {
  endpoint: string
  fetchedAt: number
  height: number
  timeMs: number
}

export const fetchLatestBlock = async (lcd: string): Promise<LatestBlock> => {
  const response = await fetchWithEndpointFallback(
    `${lcd}/cosmos/base/tendermint/v1beta1/blocks/latest`
  )
  if (!response.ok) {
    throw new Error("Failed to fetch latest block")
  }
  const data = (await response.json()) as {
    block?: { header?: { height?: string; time?: string } }
  }
  const height = Number(data?.block?.header?.height)
  if (!Number.isFinite(height)) {
    throw new Error("Invalid block height")
  }

  const timeMs = Date.parse(data?.block?.header?.time ?? "")
  if (!Number.isFinite(timeMs)) {
    throw new Error("Invalid block time")
  }

  return {
    endpoint: response.url || lcd,
    fetchedAt: Date.now(),
    height,
    timeMs
  }
}
