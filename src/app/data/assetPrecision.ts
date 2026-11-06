// This is a numeric display limit, not a protocol exponent limit. Unknown or
// unrepresentable units must not silently become six-decimal financial data.
export const readAssetDecimals = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 308
    ? value : undefined

type DenomMetadata = {
  base?: string
  display?: string
  denom_units?: Array<{ denom?: string; exponent?: number }>
}

export const readDenomMetadataDecimals = (metadata?: DenomMetadata, expectedBase?: string) => {
  if (!metadata?.base || !metadata.display || (expectedBase !== undefined && metadata.base !== expectedBase)) return undefined
  const units = metadata.denom_units ?? []
  const base = units.filter(unit => unit.denom === metadata.base)
  const display = units.filter(unit => unit.denom === metadata.display)
  if (base.length !== 1 || base[0].exponent !== 0 || display.length !== 1) return undefined
  return readAssetDecimals(display[0].exponent)
}

export const resolveNativeMarketDecimals = (
  denom: string,
  native: Record<string, { decimals?: number }>,
  ibc: Record<string, { decimals?: number }>
) => {
  // Explicit application constants; registry labels cannot change these units.
  if (denom === "uluna" || denom === "uusd") return 6
  return readAssetDecimals(denom.startsWith("ibc/")
    ? ibc[denom.slice(4).toUpperCase()]?.decimals
    : native[denom.toLowerCase()]?.decimals)
}
