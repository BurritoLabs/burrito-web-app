import { formatPercent } from "../utils/format"

export type StakeValidatorDelegation = {
  validator: string
  moniker: string
  amount: bigint
  commissionRate: number
  identity?: string
}

export type StakeDonutSegment = StakeValidatorDelegation & {
  color: string
  ratio: number
  percentLabel: string
}

const DONUT_COLORS = [
  "#7893F5",
  "#7C1AE5",
  "#FF7940",
  "#FF9F40",
  "#ACACAC",
  "#52C41A",
  "#36CFC9",
  "#FAAD14"
]

export const normalizeIdentity = (value?: string) => value?.trim() || ""

export const toBigIntOrZero = (value?: string) => {
  try {
    return BigInt(value ?? "0")
  } catch {
    return 0n
  }
}

export const formatPercentPlain = (value: number) => {
  const raw = formatPercent(value)
  return raw.startsWith("+") ? raw.slice(1) : raw
}

export const buildStakeDonutSegments = (
  validatorDelegations: StakeValidatorDelegation[],
  totalDelegated: bigint
): StakeDonutSegment[] => {
  if (!totalDelegated || totalDelegated === 0n) return []
  const single = validatorDelegations.length === 1
  return validatorDelegations.map((item, index) => {
    const ratio = Number(item.amount) / Number(totalDelegated)
    const percent = ratio * 100
    const percentLabel =
      percent > 0 && percent < 1 ? "< 1" : Math.round(percent).toString()
    return {
      ...item,
      color: single
        ? "#52C41A"
        : index === 0
        ? "#52C41A"
        : DONUT_COLORS[index % DONUT_COLORS.length],
      ratio,
      percentLabel
    }
  })
}
