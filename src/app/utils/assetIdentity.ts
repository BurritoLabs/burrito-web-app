import { getActiveAppChainKey } from "../activeChain"

const TERRA_ADDRESS_RE = /^terra1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/i
const IBC_DENOM_RE = /^ibc\/[a-f0-9]{64}$/i
const SDK_DENOM_RE = /^[a-z][a-z0-9/:._-]{2,127}$/i
const SAFE_SYMBOL_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._+\-/:()]{0,23}$/u
const CONTROL_CHAR_RE = /\p{Cc}/u

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

export const isTerraAddress = (value: string) => TERRA_ADDRESS_RE.test(value.trim())

export const isSafeNativeDenom = (value: string) => {
  const denom = value.trim()
  if (!denom || denom.length > 128) return false
  if (/^(?:native|cw20):/i.test(denom)) return false
  if (denom.includes("//")) return false
  if (IBC_DENOM_RE.test(denom)) return true
  return SDK_DENOM_RE.test(denom)
}

export const isSafeMarketAssetId = (value: string) => {
  const assetId = value.trim()
  if (assetId.startsWith("cw20:")) return isTerraAddress(assetId.slice("cw20:".length))
  if (assetId.startsWith("native:")) {
    return isSafeNativeDenom(assetId.slice("native:".length))
  }
  return isTerraAddress(assetId) || isSafeNativeDenom(assetId)
}

export const normalizeSafeMarketAssetId = (value: string) => {
  const assetId = value.trim()
  if (!assetId) return undefined
  if (assetId.startsWith("cw20:")) {
    const contract = assetId.slice("cw20:".length).toLowerCase()
    return isTerraAddress(contract) ? `cw20:${contract}` : undefined
  }
  if (assetId.startsWith("native:")) {
    const denom = assetId.slice("native:".length)
    return isSafeNativeDenom(denom) ? `native:${denom}` : undefined
  }
  if (isTerraAddress(assetId)) return `cw20:${assetId.toLowerCase()}`
  return isSafeNativeDenom(assetId) ? `native:${assetId}` : undefined
}

export const isSafeDisplaySymbol = (value?: string) => {
  const symbol = value?.trim()
  return Boolean(symbol && SAFE_SYMBOL_RE.test(symbol) && !CONTROL_CHAR_RE.test(symbol))
}

export const resolveSafeDisplaySymbol = (candidate: string | undefined, fallback: string) =>
  isSafeDisplaySymbol(candidate) ? candidate!.trim() : fallback

export const resolveSafeDisplayName = (
  candidate: string | undefined,
  fallback: string
) => {
  const name = candidate?.trim()
  if (!name || name.length > 64 || CONTROL_CHAR_RE.test(name)) return fallback
  return name
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

export const formatNativeSymbol = (
  denom: string,
  chainKey = getActiveAppChainKey()
) => {
  if (!denom) return ""
  if (denom === "uluna") return chainKey === "lunc" ? "LUNC" : "LUNA"
  if (denom === "uusd") return "USTC"
  if (/^u[a-z0-9]{2,20}$/i.test(denom)) {
    const f = denom.slice(1)
    if (
      chainKey === "lunc" &&
      CLASSIC_STABLE_MICRO_DENOMS.has(denom.toLowerCase())
    ) {
      return `${f.slice(0, 2).toUpperCase()}TC`
    }
    return f.toUpperCase()
  }
  return formatBaseDenomSymbol(denom)
}

export const resolveNativeAssetIdentity = ({
  denom,
  candidateSymbol,
  candidateName,
  chainKey = getActiveAppChainKey()
}: {
  denom: string
  candidateSymbol?: string
  candidateName?: string
  chainKey?: ReturnType<typeof getActiveAppChainKey>
}) => {
  const normalized = denom.trim().toLowerCase()
  const canonical =
    normalized === "uluna"
      ? {
          symbol: chainKey === "lunc" ? "LUNC" : "LUNA",
          name: chainKey === "lunc" ? "Terra Classic" : "Terra"
        }
      : normalized === "uusd"
        ? { symbol: "USTC", name: "TerraClassicUSD" }
        : undefined
  const fallback = formatNativeSymbol(normalized, chainKey) || "NATIVE"
  const symbol = canonical?.symbol ??
    resolveSafeDisplaySymbol(candidateSymbol, fallback)
  const name = canonical?.name ??
    resolveSafeDisplayName(candidateName, symbol)

  return { symbol, name }
}
