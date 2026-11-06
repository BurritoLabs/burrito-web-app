const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseTaxRateResponse = (data: unknown): number => {
  const rate = isRecord(data) ? data.tax_rate : undefined
  // Cosmos decimals are strings, often padded to 18 fractional places. Check
  // the range before Number() can round an out-of-range decimal down to 1.
  if (
    typeof rate !== "string" || rate.trim() !== rate ||
    !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(rate)
  ) {
    throw new Error("Invalid tax rate response")
  }
  const parsed = Number(rate)
  if (!Number.isFinite(parsed) || (parsed === 0 && /[1-9]/.test(rate))) {
    throw new Error("Invalid tax rate response")
  }
  return parsed
}

export const parseTaxableTransferResponse = (data: unknown): boolean => {
  if (!isRecord(data) || typeof data.taxable !== "boolean") {
    throw new Error("Invalid taxable transfer response")
  }
  return data.taxable
}

export const parseComputedBankSendTaxResponse = (data: unknown, denom: string): string => {
  if (!isRecord(data) || !Array.isArray(data.tax_amount)) {
    throw new Error("Invalid computed tax response")
  }
  const seen = new Set<string>()
  let amount = "0"
  for (const coin of data.tax_amount) {
    if (
      !isRecord(coin) ||
      typeof coin.denom !== "string" ||
      coin.denom.trim() !== coin.denom ||
      !/^[a-zA-Z][a-zA-Z0-9/:._-]{2,127}$/.test(coin.denom) ||
      typeof coin.amount !== "string" ||
      coin.amount.trim() !== coin.amount ||
      !/^(?:0|[1-9]\d*)$/.test(coin.amount) ||
      seen.has(coin.denom)
    ) {
      throw new Error("Invalid computed tax response")
    }
    seen.add(coin.denom)
    if (coin.denom === denom) amount = coin.amount
  }
  // Cosmos Coins are sparse: an omitted denom in a valid list is zero, including
  // an empty list for exempt transfers. A missing tax_amount field is not zero.
  return amount
}
