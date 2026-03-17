export const toUnitAmount = (
  amount: string | number | bigint | undefined,
  decimals = 6
) => {
  if (amount === undefined || amount === null || amount === "") return 0
  if (typeof amount === "bigint") {
    const value = Number(amount)
    if (!Number.isFinite(value)) return 0
    return value / 10 ** decimals
  }
  const value = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(value)) return 0
  return value / 10 ** decimals
}

export const formatNumber = (
  value: number,
  maximumFractionDigits = 2
) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits
  }).format(value)

const numberToPlainString = (value: number) => {
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

export const formatNumberNoRoundByNonZeroFractionDigits = (
  value: number,
  maxNonZeroFractionDigits = 4,
  hardFractionCap = 18
) => {
  if (!Number.isFinite(value)) return String(value)

  const sign = value < 0 ? "-" : ""
  const plain = numberToPlainString(Math.abs(value))
  const [intPart, fracPart = ""] = plain.split(".")
  const withGrouping = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

  if (!fracPart) return `${sign}${withGrouping}`

  let kept = ""
  let nonZeroCount = 0
  for (const digit of fracPart) {
    if (kept.length >= hardFractionCap) break
    kept += digit
    if (digit !== "0") {
      nonZeroCount += 1
      if (nonZeroCount >= maxNonZeroFractionDigits) break
    }
  }

  if (nonZeroCount === 0) return `${sign}${withGrouping}`
  kept = kept.replace(/0+$/, "")
  return `${sign}${withGrouping}.${kept}`
}

export const formatTokenAmount = (
  amount: string | number | bigint | undefined,
  decimals = 6,
  maximumFractionDigits = 2
) => {
  if (amount === undefined || amount === null || amount === "") return "--"
  const value = toUnitAmount(amount, decimals)
  return formatNumber(value, maximumFractionDigits)
}

export const formatUsd = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return `$${formatNumber(value, 2)}`
}

export const formatPercent = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

export const truncateHash = (hash: string | undefined, start = 6, end = 4) => {
  if (!hash) return "--"
  return `${hash.slice(0, start)}...${hash.slice(-end)}`
}

export const formatTimestamp = (timestamp: string | undefined) => {
  if (!timestamp) return "--"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

export const sumAmounts = (amounts: Array<string | number | bigint | undefined>) =>
  amounts.reduce<number>((total, item) => {
    if (item === undefined || item === null || item === "") return total
    if (typeof item === "bigint") {
      const value = Number(item)
      if (!Number.isFinite(value)) return total
      return total + value
    }
    const value = typeof item === "string" ? Number(item) : item
    if (!Number.isFinite(value)) return total
    return total + value
  }, 0)
