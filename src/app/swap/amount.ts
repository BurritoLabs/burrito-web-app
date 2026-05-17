export const parseBigInt = (value: string | undefined) => {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

export const sanitizeAmount = (value: string) => {
  let next = value.replace(/,/g, "").replace(/[^\d.]/g, "")
  const firstDot = next.indexOf(".")
  if (firstDot >= 0) {
    next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "")
  }
  return next
}

export const toMicroAmount = (value: string, decimals = 6) => {
  const cleaned = sanitizeAmount(value).trim()
  if (!cleaned) return 0n
  const [wholePartRaw, fracPartRaw = ""] = cleaned.split(".")
  const wholePart = wholePartRaw || "0"
  if (!/^\d+$/.test(wholePart) || (fracPartRaw && !/^\d+$/.test(fracPartRaw))) {
    return 0n
  }
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0")
  const merged = `${wholePart}${fracPart}`.replace(/^0+/, "") || "0"
  return parseBigInt(merged)
}

export const fromMicroAmount = (value: bigint, decimals = 6) => {
  if (value <= 0n) return "0"
  if (decimals <= 0) return value.toString()
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}
