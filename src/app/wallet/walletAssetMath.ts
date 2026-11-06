import { readAssetDecimals } from "../data/assetPrecision"
import { formatNumber } from "../utils/format"

export const walletUnitAmount = (amount: string, precision: unknown) => {
  const decimals = readAssetDecimals(precision)
  if (decimals === undefined || !/^\d+$/.test(amount)) return undefined
  // Move the decimal point before converting so large raw integers do not overflow first.
  const padded = amount.padStart(decimals + 1, "0")
  const units = Number(decimals === 0 ? padded : `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`)
  return Number.isFinite(units) ? units : undefined
}

export const formatWalletAmount = (amount: string, precision: unknown, digits = 2) => {
  if (readAssetDecimals(precision) === undefined) return `${amount} raw units (precision unavailable)`
  const units = walletUnitAmount(amount, precision)
  return units === undefined ? "Amount unavailable" : formatNumber(units, digits)
}

export const walletValueAtPrice = (amount: string, precision: unknown, price?: number) => {
  const units = walletUnitAmount(amount, precision)
  if (units === undefined || price === undefined || !Number.isFinite(price) || price < 0) return undefined
  const value = units * price
  return Number.isFinite(value) ? value : undefined
}

const CLASSIC_ORACLE_DENOMS = new Set([
  "uluna", "uusd", "uaud", "ucad", "uchf", "ucny", "udkk", "ueur", "ugbp",
  "uhkd", "uinr", "ujpy", "ukrw", "umnt", "unok", "usdr", "usek", "usgd", "uthb", "utwd"
])

// FCD returns oracle[denom] / oracle[base] without decimal conversion:
// https://github.com/terra-money/fcd-classic/blob/main/src/service/market/helper.ts#L38-L53
// Restrict this fallback to established Classic native micro-denoms. An IBC token,
// arbitrary native denom or non-six-decimal asset requires an identity-keyed DEX quote.
// The caller queries base=uusd, so every rate needs USTC's USD price (never a $1 peg).
export const walletOracleUsdPrice = (
  denom: string, precision: unknown, swaprate?: number, ustcUsd?: number, isClassic = false
) => {
  if (!isClassic || !CLASSIC_ORACLE_DENOMS.has(denom) || readAssetDecimals(precision) !== 6 ||
      swaprate === undefined || !Number.isFinite(swaprate) || swaprate <= 0 ||
      ustcUsd === undefined || !Number.isFinite(ustcUsd) || ustcUsd < 0) return undefined
  const price = ustcUsd / swaprate
  return Number.isFinite(price) ? price : undefined
}

export const walletValueFromSwaprate = (
  amount: string, denom: string, precision: unknown, swaprate?: number, ustcUsd?: number, isClassic = false
) => walletValueAtPrice(amount, precision, walletOracleUsdPrice(denom, precision, swaprate, ustcUsd, isClassic))

// Deliberately accepts no symbol/native quote: a CW20 ticker cannot establish native identity.
export const walletCw20Financials = (
  token: { address: string; balance: string; decimals?: number },
  resolveContractValue: (address: string, amount: string, decimals: number) => number | undefined
) => {
  const decimals = readAssetDecimals(token.decimals)
  const units = walletUnitAmount(token.balance, decimals)
  const candidate = decimals !== undefined && units !== undefined
    ? resolveContractValue(token.address, token.balance, decimals) : undefined
  const value = candidate !== undefined && Number.isFinite(candidate) && candidate >= 0 ? candidate : undefined
  return { decimals, value, price: value !== undefined && units !== undefined && units > 0 ? value / units : undefined }
}
