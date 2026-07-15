import { isSafeNativeDenom, isTerraAddress } from "../utils/assetIdentity"

export type FactoryAssetInfo = {
  native_token?: { denom?: string }
  token?: { contract_addr?: string }
}

export type FactoryPairRecord = {
  contract_addr?: string
  contract?: string
  asset_infos?: FactoryAssetInfo[]
  asset1?: FactoryAssetInfo
  asset2?: FactoryAssetInfo
  pair_type?: unknown
}

export type ParsedFactoryPair = {
  pair: string
  dexId: string
  dexLabel: string
  type: string
  assets: [string, string]
}

const normalizeAssetKey = (info: FactoryAssetInfo | undefined) => {
  const nativeDenom = info?.native_token?.denom?.trim()
  if (nativeDenom && isSafeNativeDenom(nativeDenom)) return nativeDenom

  const contract = info?.token?.contract_addr?.trim().toLowerCase()
  return contract && isTerraAddress(contract) ? contract : undefined
}

const resolvePairType = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.toLowerCase()
    if (normalized.includes("concentrated")) return "concentrated"
    return normalized.includes("stable") ? "stable" : "xyk"
  }
  if (value && typeof value === "object") {
    if ("stable_swap" in value) return "stable"
    if ("custom" in value) {
      const custom = String(value.custom).toLowerCase()
      if (custom.includes("concentrated")) return "concentrated"
      if (custom.includes("stable")) return "stable"
    }
  }
  return "xyk"
}

export const getFactoryPairCursor = (entry: FactoryPairRecord | undefined) =>
  Array.isArray(entry?.asset_infos) && entry.asset_infos.length >= 2
    ? entry.asset_infos
    : undefined

export const parseFactoryPairRecord = (
  entry: FactoryPairRecord,
  dex: { id: string; label: string }
): ParsedFactoryPair | undefined => {
  const pair = (entry.contract_addr ?? entry.contract)?.trim().toLowerCase()
  const assetInfos = Array.isArray(entry.asset_infos)
    ? entry.asset_infos
    : entry.asset1 && entry.asset2
      ? [entry.asset1, entry.asset2]
      : []
  const left = normalizeAssetKey(assetInfos[0])
  const right = normalizeAssetKey(assetInfos[1])

  if (!pair || !isTerraAddress(pair) || !left || !right || left === right) {
    return undefined
  }

  return {
    pair,
    dexId: dex.id.toLowerCase(),
    dexLabel: dex.label,
    type: resolvePairType(entry.pair_type),
    assets: [left, right]
  }
}
