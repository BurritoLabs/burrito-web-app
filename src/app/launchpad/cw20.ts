import { toUtf8 } from "@cosmjs/encoding"
import { MsgInstantiateContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"

export const LAUNCHPAD_CW20_CODE_ID = 3n
export const LAUNCHPAD_CW20_CODE_ID_LABEL = "Terra Classic CW20 code ID 3"

export type Cw20InstantiateInput = {
  creatorAddress: string
  name: string
  symbol: string
  supply: string
  decimals: number
}

export const parseTokenAmountToBaseUnits = (
  value: string,
  decimals: number,
  label = "Amount"
) => {
  const normalized = value.replace(/,/g, "").trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${label} must be a positive number.`)
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Decimals must be between 0 and 18.")
  }

  const [whole, fraction = ""] = normalized.split(".")
  if (fraction.length > decimals) {
    throw new Error(`${label} has more than ${decimals} decimal places.`)
  }

  const padded = `${whole}${fraction.padEnd(decimals, "0")}`.replace(
    /^0+(?=\d)/,
    ""
  )
  const amount = BigInt(padded || "0")
  if (amount <= 0n) {
    throw new Error(`${label} must be greater than zero.`)
  }
  return amount.toString()
}

export const formatBaseUnitsToTokenAmount = (
  amount: string | undefined,
  decimals: number,
  maximumFractionDigits = 6
) => {
  if (!amount) return "--"
  if (!/^\d+$/.test(amount)) return "--"
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    return "--"
  }

  const padded =
    decimals > 0 ? amount.padStart(decimals + 1, "0") : amount
  const whole =
    decimals > 0 ? padded.slice(0, padded.length - decimals) : padded
  const fraction = decimals > 0 ? padded.slice(-decimals) : ""
  const trimmedFraction = fraction.replace(/0+$/, "")
  const normalized = trimmedFraction
    ? `${whole}.${trimmedFraction}`
    : whole
  const numeric = Number(normalized)

  if (!Number.isFinite(numeric)) {
    return normalized
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits
  }).format(numeric)
}

export const buildCw20InstantiatePayload = ({
  creatorAddress,
  name,
  symbol,
  supply,
  decimals
}: Cw20InstantiateInput) => ({
  name: name.trim(),
  symbol: symbol.trim().toUpperCase(),
  decimals,
  initial_balances: [
    {
      address: creatorAddress,
      amount: parseTokenAmountToBaseUnits(supply, decimals, "Supply")
    }
  ],
  mint: null
})

export const buildCw20InstantiateMessage = (
  input: Cw20InstantiateInput,
  label: string
) => ({
  typeUrl: "/cosmwasm.wasm.v1.MsgInstantiateContract",
  value: MsgInstantiateContract.fromPartial({
    sender: input.creatorAddress,
    admin: "",
    codeId: LAUNCHPAD_CW20_CODE_ID,
    label,
    msg: toUtf8(JSON.stringify(buildCw20InstantiatePayload(input))),
    funds: []
  })
})

export const extractContractAddressFromEvents = (
  events:
    | ReadonlyArray<{
        type: string
        attributes: ReadonlyArray<{ key: string; value: string }>
      }>
    | undefined
) => {
  if (!events?.length) return ""
  for (const event of events) {
    for (const attr of event.attributes ?? []) {
      if (attr.key === "_contract_address" || attr.key === "contract_address") {
        return attr.value
      }
    }
  }
  return ""
}
