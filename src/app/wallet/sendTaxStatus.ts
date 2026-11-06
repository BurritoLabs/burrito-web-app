export type SendTaxMode = "pending" | "taxed" | "exempt" | "no-tax" | "cw20" | "error"

export const resolveSendTaxMode = (state: {
  isClassic: boolean
  kind: "native" | "ibc" | "cw20"
  hasAccount: boolean
  recipientIsValid: boolean
  rate?: number
  rateError: boolean
  taxable?: boolean
  taxableError: boolean
  taxableFetching: boolean
  amount: bigint
  computedAmount?: string
  computedError: boolean
  computedFetching: boolean
}): SendTaxMode => {
  if (!state.isClassic) return "no-tax"
  if (state.kind === "cw20") return "cw20"
  if (state.rateError || state.taxableError || state.computedError) return "error"
  if (state.rate === undefined || !Number.isFinite(state.rate) || state.rate < 0 || state.rate > 1) return "pending"
  if (!state.hasAccount || !state.recipientIsValid || state.amount <= 0n) return "pending"
  if (state.taxable === undefined || state.taxableFetching || state.computedAmount === undefined || state.computedFetching) return "pending"
  if (!/^(0|[1-9]\d*)$/.test(state.computedAmount)) return "error"
  if (state.taxable === false) return "exempt"
  return BigInt(state.computedAmount) > 0n ? "taxed" : "no-tax"
}
