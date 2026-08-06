type AssetProvenanceLike = {
  originChainId?: string
  provenanceLabel?: string
  transport?: string
}

export const getAssetProvenanceLabel = (
  asset?: AssetProvenanceLike,
  compact = false
) => {
  if (!asset) return undefined
  const origin = asset.provenanceLabel?.trim() || asset.originChainId?.trim()
  const transport = asset.transport?.trim().toLowerCase()
  if (origin && transport === "ibc") {
    return compact ? `${origin} IBC` : `${origin} via IBC`
  }
  if (origin) return origin
  if (transport === "ibc") return "IBC"
  return undefined
}
