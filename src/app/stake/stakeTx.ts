export type StakeAction = "Delegate" | "Redelegate" | "Undelegate"

export const GAS_PRICE_MICRO_LUNC = 28.325

export const FALLBACK_GAS_BY_TAB = {
  Delegate: 900_000,
  Redelegate: 1_100_000,
  Undelegate: 900_000
} as const satisfies Record<StakeAction, number>

export const SUBMIT_GAS_ADJUSTMENT = 1.6
export const MAX_DELEGATE_BUFFER_MICRO = 2_000_000n
const MICRO_UNITS_PER_LUNC = 1_000_000n

export const toMicroAmount = (value: string) => {
  const cleaned = value.replace(/,/g, "").trim()
  if (!/^\d*(\.\d*)?$/.test(cleaned)) return "0"

  const [wholeRaw = "", fractionRaw = ""] = cleaned.split(".")
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0"
  const fraction = fractionRaw.padEnd(6, "0").slice(0, 6)
  const amount =
    BigInt(whole) * MICRO_UNITS_PER_LUNC + BigInt(fraction || "0")

  return amount > 0n ? amount.toString() : "0"
}

export const formatMicroAmountForInput = (amount: bigint) => {
  if (amount <= 0n) return "0"

  const whole = amount / MICRO_UNITS_PER_LUNC
  const fraction = (amount % MICRO_UNITS_PER_LUNC)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")

  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

export const estimateFallbackFeeMicro = (tab: StakeAction) => {
  const gas = FALLBACK_GAS_BY_TAB[tab]
  return BigInt(Math.ceil(gas * GAS_PRICE_MICRO_LUNC))
}
