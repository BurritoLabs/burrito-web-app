export type StakeAction = "Delegate" | "Redelegate" | "Undelegate"

export const GAS_PRICE_MICRO_LUNC = 28.325

export const FALLBACK_GAS_BY_TAB = {
  Delegate: 900_000,
  Redelegate: 1_100_000,
  Undelegate: 900_000
} as const satisfies Record<StakeAction, number>

export const SUBMIT_GAS_ADJUSTMENT = 1.6
export const MAX_DELEGATE_BUFFER_MICRO = 2_000_000n

export const toMicroAmount = (value: string) => {
  const cleaned = value.replace(/,/g, "").trim()
  const num = Number(cleaned)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

export const estimateFallbackFeeMicro = (tab: StakeAction) => {
  const gas = FALLBACK_GAS_BY_TAB[tab]
  return BigInt(Math.ceil(gas * GAS_PRICE_MICRO_LUNC))
}
