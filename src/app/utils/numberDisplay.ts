import { formatNumber } from "./format"

export const numberToPlainString = (value: number) => {
  if (!Number.isFinite(value)) return String(value)
  const raw = value.toString()
  if (!raw.toLowerCase().includes("e")) return raw

  const sign = raw.startsWith("-") ? "-" : ""
  const normalized = sign ? raw.slice(1) : raw
  const [coefficient, exponentPart] = normalized.toLowerCase().split("e")
  const exponent = Number(exponentPart)
  const [intPart, fracPart = ""] = coefficient.split(".")
  const digits = `${intPart}${fracPart}`
  const decimalIndex = intPart.length + exponent

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
}

export const trimFractionByNonZeroDigits = (
  fraction: string,
  maxNonZeroDigits = 4,
  hardFractionCap = 24
) => {
  if (!fraction) return ""
  let kept = ""
  let nonZeroCount = 0
  for (const digit of fraction) {
    if (kept.length >= hardFractionCap) break
    kept += digit
    if (digit !== "0") {
      nonZeroCount += 1
      if (nonZeroCount >= maxNonZeroDigits) break
    }
  }
  return nonZeroCount > 0 ? kept : ""
}

export const formatUsdCompact = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""

  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000, suffix: "t" },
    { threshold: 1_000_000_000, suffix: "b" },
    { threshold: 1_000_000, suffix: "m" },
    { threshold: 1_000, suffix: "k" }
  ]

  for (const unit of units) {
    if (abs >= unit.threshold) {
      const scaled = abs / unit.threshold
      const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
      return `${sign}$${formatNumber(scaled, decimals)}${unit.suffix}`
    }
  }

  const decimals = abs >= 1 ? 2 : 4
  return `${sign}$${formatNumber(abs, decimals)}`
}
