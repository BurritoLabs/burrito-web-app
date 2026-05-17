import type { CoinBalance } from "../data/classic"
import { formatTokenAmount, toUnitAmount } from "../utils/format"

export type SummaryMap = Record<string, unknown>
export type SummaryCoin = { denom: string; amount: string | number | bigint }

export const isSummaryMap = (value: unknown): value is SummaryMap =>
  typeof value === "object" && value !== null

export const isSummaryCoin = (value: unknown): value is SummaryCoin =>
  isSummaryMap(value) &&
  typeof value.denom === "string" &&
  (typeof value.amount === "string" ||
    typeof value.amount === "number" ||
    typeof value.amount === "bigint")

export const parseSequenceMismatchExpected = (message: string) => {
  const matched = message.match(/expected\s+(\d+)\s*,\s*got\s+\d+/i)
  if (!matched) return undefined
  const value = Number(matched[1])
  return Number.isFinite(value) ? value : undefined
}

export const toSafeBigInt = (value?: string | number | bigint | null) => {
  try {
    if (value === undefined || value === null || value === "") return 0n
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(Math.trunc(value))
    return BigInt(value)
  } catch {
    return 0n
  }
}

export const toMicroAmount = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

export type VoteChoice = "YES" | "NO" | "NO_WITH_VETO" | "ABSTAIN"

export const VOTE_OPTION_VALUES: Record<VoteChoice, number> = {
  YES: 1,
  ABSTAIN: 2,
  NO: 3,
  NO_WITH_VETO: 4
}

export const formatDenom = (denom: string) => {
  if (!denom) return "--"
  if (denom === "uluna") return "LUNC"
  if (denom === "uusd") return "USTC"
  if (denom.startsWith("u")) {
    const f = denom.slice(1)
    if (f.length > 3) {
      return f.toUpperCase()
    }
    return f.slice(0, 2).toUpperCase() + "T"
  }
  return denom.toUpperCase()
}

export const formatCoinList = (coins: CoinBalance[]) => {
  if (!coins.length) return "--"
  return coins
    .map(
      (coin) =>
        `${formatTokenAmount(coin.amount, 6, 2)} ${formatDenom(coin.denom)}`
    )
    .join(", ")
}

export const formatDurationLabel = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--"
  const days = seconds / 86_400
  if (Number.isInteger(days) && days >= 1) return `${days} day${days === 1 ? "" : "s"}`
  const hours = seconds / 3_600
  if (Number.isInteger(hours) && hours >= 1)
    return `${hours} hour${hours === 1 ? "" : "s"}`
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

export const sanitizeDecimalInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "")
  const [whole = "", ...fractionParts] = cleaned.split(".")
  const fraction = fractionParts.join("").slice(0, 6)
  return fractionParts.length ? `${whole}.${fraction}` : whole
}

export const formatAmountInput = (microAmount: string) => {
  const value = toUnitAmount(microAmount, 6)
  if (!Number.isFinite(value) || value <= 0) return ""
  return value.toFixed(6).replace(/\.?0+$/, "")
}

export const normalizeRenderedVoteOption = (value: string): string => {
  const text = String(value ?? "").trim()
  if (!text || text === "--") return "--"
  const normalizedText = text.includes('\\"') ? text.replace(/\\"/g, '"') : text
  if (/^\d+$/.test(text)) {
    if (text === "1") return "YES"
    if (text === "2") return "ABSTAIN"
    if (text === "3") return "NO"
    if (text === "4") return "NO_WITH_VETO"
  }
  if (normalizedText.startsWith("[") || normalizedText.startsWith("{")) {
    try {
      const parsed = JSON.parse(normalizedText) as unknown
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      if (typeof first === "object" && first !== null) {
        const option = (first as { option?: unknown; Option?: unknown }).option ??
          (first as { option?: unknown; Option?: unknown }).Option
        if (option !== undefined) return normalizeRenderedVoteOption(String(option))
      }
    } catch {
      // Fall through to log-style parsing.
    }
  }
  const logOption = normalizedText.match(/"?[Oo]ption"?\s*[:=]\s*"?([A-Z0-9_]+)"?/)
  if (logOption?.[1]) return normalizeRenderedVoteOption(logOption[1])
  const upper = normalizedText.toUpperCase()
  if (upper.includes("NO_WITH_VETO")) return "NO_WITH_VETO"
  if (upper.includes("ABSTAIN")) return "ABSTAIN"
  if (upper.includes("YES")) return "YES"
  if (upper.includes("NO")) return "NO"
  return upper
}

export const formatVoteOption = (value: string) => {
  const upper = normalizeRenderedVoteOption(value)
  if (upper === "YES") return "Yes"
  if (upper === "NO_WITH_VETO") return "No with veto"
  if (upper === "NO") return "No"
  if (upper === "ABSTAIN") return "Abstain"
  return value
}

export const getVoteColor = (value: string) => {
  const upper = normalizeRenderedVoteOption(value)
  if (upper === "YES") return "#52c41a"
  if (upper === "NO_WITH_VETO") return "#ff4d4f"
  if (upper === "NO") return "#ff7aa2"
  if (upper === "ABSTAIN") return "#f6c343"
  return "rgba(255,255,255,0.12)"
}

export const getWeightPercent = (value: bigint, total: bigint) => {
  if (total <= 0n) return 0
  const scaled = (value * 10000n) / total
  return Math.min(100, Number(scaled) / 100)
}

export const formatPercentPlain = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return `${value.toFixed(2)}%`
}

export const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value
