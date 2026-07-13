import { getActiveAppChainKey } from "../activeChain"

export const normalizeAssetKey = (key: string) => {
  if (!key) return key
  if (key.startsWith("terra1")) return key.toLowerCase()
  if (key.startsWith("ibc/")) return `ibc/${key.slice(4).toUpperCase()}`
  return key.toLowerCase()
}

export const formatNativeSymbol = (denom: string) => {
  if (!denom) return ""
  if (denom === "uluna") return getActiveAppChainKey() === "lunc" ? "LUNC" : "LUNA"
  if (denom === "uusd") return "USTC"
  if (denom.startsWith("u")) {
    const f = denom.slice(1)
    if (f.length === 3) return `${f.slice(0, 2).toUpperCase()}TC`
    return f.toUpperCase()
  }
  return denom.toUpperCase()
}
