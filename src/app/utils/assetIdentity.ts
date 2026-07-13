import { getActiveAppChainKey } from "../activeChain"

const CLASSIC_STABLE_MICRO_DENOMS = new Set([
  "uaud",
  "ucad",
  "uchf",
  "ucny",
  "udkk",
  "ueur",
  "ugbp",
  "uhkd",
  "uinr",
  "ujpy",
  "ukrw",
  "umnt",
  "unok",
  "usdr",
  "usek",
  "usgd",
  "uthb",
  "utwd"
])

export const normalizeAssetKey = (key: string) => {
  if (!key) return key
  if (key.startsWith("terra1")) return key.toLowerCase()
  if (key.startsWith("ibc/")) return `ibc/${key.slice(4).toUpperCase()}`
  return key.toLowerCase()
}

export const formatBaseDenomSymbol = (denom: string) => {
  const trimmed = denom.trim()
  if (!trimmed) return ""

  const isFactoryDenom = trimmed.startsWith("factory/") || trimmed.startsWith("factory:")
  const segments = trimmed.split(/[/:]/).filter(Boolean)
  const leaf = segments.at(-1) ?? trimmed

  if (isFactoryDenom) return leaf.length > 24 ? `${leaf.slice(0, 14)}...${leaf.slice(-6)}` : leaf
  if (/^u[a-z0-9]{2,20}$/i.test(leaf)) return leaf.slice(1).toUpperCase()

  const bridgeUnit = leaf.replace(/-(?:wei|satoshi)$/i, "")
  const display = bridgeUnit || leaf
  return display.length > 24
    ? `${display.slice(0, 14)}...${display.slice(-6)}`
    : display.toUpperCase()
}

export const formatNativeSymbol = (denom: string) => {
  if (!denom) return ""
  if (denom === "uluna") return getActiveAppChainKey() === "lunc" ? "LUNC" : "LUNA"
  if (denom === "uusd") return "USTC"
  if (/^u[a-z0-9]{2,20}$/i.test(denom)) {
    const f = denom.slice(1)
    if (
      getActiveAppChainKey() === "lunc" &&
      CLASSIC_STABLE_MICRO_DENOMS.has(denom.toLowerCase())
    ) {
      return `${f.slice(0, 2).toUpperCase()}TC`
    }
    return f.toUpperCase()
  }
  return formatBaseDenomSymbol(denom)
}
