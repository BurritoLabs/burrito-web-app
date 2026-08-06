type AssetProvenanceLike = {
  contract?: string
  denom?: string
  id?: string
  name?: string
  originChainId?: string
  provenanceLabel?: string
  transport?: string
}

const bridgeLabelFromName = (name?: string) => {
  const match = name?.trim().match(/\((Wormhole|Axelar|Portal)\)\s*$/i)
  if (!match) return undefined
  const bridge = match[1].toLowerCase()
  if (bridge === "wormhole") return "Wormhole"
  if (bridge === "axelar") return "Axelar"
  return "Portal"
}

export const getAssetProvenanceLabel = (
  asset?: AssetProvenanceLike,
  compact = false
) => {
  if (!asset) return undefined
  const origin =
    asset.provenanceLabel?.trim() ||
    asset.originChainId?.trim() ||
    bridgeLabelFromName(asset.name)
  const explicitTransport = asset.transport?.trim().toLowerCase()
  const assetId = asset.id?.trim().toLowerCase()
  const denom = asset.denom?.trim().toLowerCase()
  const transport =
    explicitTransport ||
    (asset.contract || assetId?.startsWith("cw20:")
      ? "cw20"
      : denom?.startsWith("ibc/") || assetId?.startsWith("native:ibc/")
        ? "ibc"
        : undefined)
  if (origin && transport === "ibc") {
    return compact ? `${origin} IBC` : `${origin} via IBC`
  }
  if (origin && transport === "cw20") {
    return `${origin} CW20`
  }
  if (origin) return origin
  if (transport === "ibc") return "IBC"
  return undefined
}
