const toRawMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  return fallback
}

const cleanRpcNoise = (message: string) =>
  message
    .replace(/^Query failed with \(\d+\):\s*/i, "")
    .replace(/^rpc error:\s*/i, "")
    .replace(/^code = Unknown desc =\s*/i, "")
    .replace(/\s*\[CosmWasm\/wasmd@[^\]]+\]\s*/i, " ")
    .replace(/\s*with gas used:\s*'?\d+'?\s*/i, " ")
    .replace(/\s*: unknown request\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()

export const formatTxError = (
  error: unknown,
  fallback = "Transaction failed"
) => {
  const raw = cleanRpcNoise(toRawMessage(error, fallback))
  const lower = raw.toLowerCase()

  if (
    lower.includes("user rejected") ||
    lower.includes("request rejected") ||
    lower.includes("rejected by user") ||
    lower.includes("denied by user") ||
    lower.includes("user denied")
  ) {
    return "Transaction cancelled in wallet."
  }

  if (
    lower.includes("signature verification failed") ||
    lower.includes("account sequence mismatch") ||
    lower.includes("wrong sequence") ||
    /\bsequence\b.*\bchain-id\b/i.test(raw) ||
    /expected\s+\d+\s*,\s*got\s+\d+/i.test(raw)
  ) {
    return "Wallet signature is out of sync. Reconnect the wallet or refresh the page, then submit again."
  }

  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient balance") ||
    lower.includes("spendable balance") ||
    lower.includes("not enough") ||
    lower.includes("insufficient fee")
  ) {
    return "Insufficient balance to cover the amount, tax, and network fee."
  }

  if (lower.includes("max spread assertion") || lower.includes("max spread")) {
    return "Price moved beyond your slippage limit. Increase slippage slightly or reduce the amount and try again."
  }

  if (
    lower.includes("out of gas") ||
    lower.includes("gas wanted") ||
    lower.includes("gas limit")
  ) {
    return "Network fee was too low for this transaction. Retry with a higher gas estimate."
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("not authorized") ||
    lower.includes("sender is not admin")
  ) {
    return "This wallet is not authorized for that action."
  }

  if (lower.includes("ticker symbol is not in expected format")) {
    return "Token symbol must be 3-12 letters. Use letters only for maximum compatibility."
  }

  if (lower.includes("slippage must")) {
    return raw
  }

  if (raw.length > 220) {
    return `${fallback}. ${raw.slice(0, 220)}...`
  }

  return raw || fallback
}
