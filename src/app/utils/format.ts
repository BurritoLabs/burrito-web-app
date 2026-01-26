export const toUnitAmount = (
  amount: string | number | undefined,
  decimals = 6
) => {
  if (amount === undefined || amount === null || amount === "") return 0
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

export const formatTokenAmount = (
  amount: string | number | undefined,
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
    hour: "2-digit",
    minute: "2-digit"
  })
}

export const sumAmounts = (amounts: Array<string | number | undefined>) =>
  amounts.reduce((total, item) => {
    if (item === undefined || item === null || item === "") return total
    const value = typeof item === "string" ? Number(item) : item
    if (!Number.isFinite(value)) return total
    return total + value
  }, 0)
