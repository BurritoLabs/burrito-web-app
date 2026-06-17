const TX_DIAGNOSTICS_STORAGE_KEY = "burrito:tx-diagnostics:v1"
const MAX_STORED_TX_DIAGNOSTICS = 50

export type TxDiagnosticPhase = "start" | "success" | "failure"

export type TxErrorCategory =
  | "wallet_rejected"
  | "sequence_mismatch"
  | "already_submitted"
  | "insufficient_funds"
  | "slippage"
  | "gas_too_low"
  | "network"
  | "unauthorized"
  | "invalid_symbol"
  | "validation"
  | "unknown"

export type TxDiagnosticEvent = {
  phase: TxDiagnosticPhase
  label?: string
  connectorId?: string
  accountAddress?: string
  txHash?: string
  category?: TxErrorCategory
  message?: string
  rawMessage?: string
  gasUsed?: string | number
  gasWanted?: string | number
}

export type StoredTxDiagnosticEvent = TxDiagnosticEvent & {
  id: string
  at: string
}

const toRawMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  return fallback
}

export const cleanTxErrorMessage = (message: string) =>
  message
    .replace(/^Query failed with \(\d+\):\s*/i, "")
    .replace(/^rpc error:\s*/i, "")
    .replace(/^code = Unknown desc =\s*/i, "")
    .replace(/\s*\[CosmWasm\/wasmd@[^\]]+\]\s*/i, " ")
    .replace(/\s*with gas used:\s*'?\d+'?\s*/i, " ")
    .replace(/\s*: unknown request\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()

export const parseSequenceMismatchExpected = (message: string) => {
  const matched = message.match(/expected\s+(\d+)\s*,\s*got\s+\d+/i)
  if (!matched) return undefined
  const value = Number(matched[1])
  return Number.isFinite(value) ? value : undefined
}

export const isTxAlreadyInCacheError = (error: unknown) => {
  const rawMessage = toRawMessage(error, "")
  const lower = cleanTxErrorMessage(rawMessage).toLowerCase()
  return (
    lower.includes("tx already exists in cache") ||
    lower.includes("transaction already exists in cache") ||
    lower.includes("already exists in cache")
  )
}

const createDiagnosticId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const classifyTxError = (
  error: unknown,
  fallback = "Transaction failed"
) => {
  const rawMessage = toRawMessage(error, fallback)
  const raw = cleanTxErrorMessage(rawMessage)
  const lower = raw.toLowerCase()

  if (
    lower.includes("user rejected") ||
    lower.includes("request rejected") ||
    lower.includes("rejected by user") ||
    lower.includes("denied by user") ||
    lower.includes("user denied")
  ) {
    return {
      category: "wallet_rejected" as const,
      raw,
      rawMessage,
      userMessage: "Transaction cancelled in wallet."
    }
  }

  if (
    lower.includes("signature verification failed") ||
    lower.includes("account sequence mismatch") ||
    lower.includes("wrong sequence") ||
    lower.includes("wallet not sync") ||
    lower.includes("wallet is not sync") ||
    /\bsequence\b.*\bchain-id\b/i.test(raw) ||
    /expected\s+\d+\s*,\s*got\s+\d+/i.test(raw)
  ) {
    return {
      category: "sequence_mismatch" as const,
      raw,
      rawMessage,
      userMessage:
        "Wallet signature is out of sync. Reconnect the wallet or refresh the page, then submit again."
    }
  }

  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient balance") ||
    lower.includes("spendable balance") ||
    lower.includes("not enough") ||
    lower.includes("insufficient fee")
  ) {
    return {
      category: "insufficient_funds" as const,
      raw,
      rawMessage,
      userMessage: "Insufficient balance to cover the amount, tax, and network fee."
    }
  }

  if (lower.includes("max spread assertion") || lower.includes("max spread")) {
    return {
      category: "slippage" as const,
      raw,
      rawMessage,
      userMessage:
        "Price moved beyond your slippage limit. Increase slippage slightly or reduce the amount and try again."
    }
  }

  if (
    lower.includes("out of gas") ||
    lower.includes("gas wanted") ||
    lower.includes("gas limit")
  ) {
    return {
      category: "gas_too_low" as const,
      raw,
      rawMessage,
      userMessage:
        "Network fee was too low for this transaction. Retry with a higher gas estimate."
    }
  }

  if (isTxAlreadyInCacheError(rawMessage)) {
    return {
      category: "already_submitted" as const,
      raw,
      rawMessage,
      userMessage:
        "Transaction was already submitted and is waiting in the network cache. Wait a moment for confirmation before trying again."
    }
  }

  if (
    /\b(408|425|429|500|502|503|504)\b/.test(raw) ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("network error") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed")
  ) {
    return {
      category: "network" as const,
      raw,
      rawMessage,
      userMessage:
        "The network endpoint is busy or rate limited. Burrito will try another endpoint when possible; wait a moment and submit again if this continues."
    }
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("not authorized") ||
    lower.includes("sender is not admin")
  ) {
    return {
      category: "unauthorized" as const,
      raw,
      rawMessage,
      userMessage: "This wallet is not authorized for that action."
    }
  }

  if (lower.includes("ticker symbol is not in expected format")) {
    return {
      category: "invalid_symbol" as const,
      raw,
      rawMessage,
      userMessage:
        "Token symbol must be 3-12 letters. Use letters only for maximum compatibility."
    }
  }

  if (lower.includes("slippage must")) {
    return {
      category: "validation" as const,
      raw,
      rawMessage,
      userMessage: raw
    }
  }

  return {
    category: "unknown" as const,
    raw,
    rawMessage,
    userMessage: raw.length > 220 ? `${fallback}. ${raw.slice(0, 220)}...` : raw || fallback
  }
}

export const recordTxDiagnostic = (event: TxDiagnosticEvent) => {
  if (typeof window === "undefined") return

  try {
    const raw = window.localStorage.getItem(TX_DIAGNOSTICS_STORAGE_KEY)
    const previous = raw
      ? (JSON.parse(raw) as StoredTxDiagnosticEvent[])
      : []
    const next: StoredTxDiagnosticEvent = {
      ...event,
      id: createDiagnosticId(),
      at: new Date().toISOString()
    }
    window.localStorage.setItem(
      TX_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify([next, ...previous].slice(0, MAX_STORED_TX_DIAGNOSTICS))
    )
  } catch {
    // Diagnostics must never affect transaction execution.
  }
}

export const getStoredTxDiagnostics = () => {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(TX_DIAGNOSTICS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? (parsed as StoredTxDiagnosticEvent[]).slice(0, MAX_STORED_TX_DIAGNOSTICS)
      : []
  } catch {
    return []
  }
}

export const buildTxDiagnosticsReport = (limit = 8) => {
  const events = getStoredTxDiagnostics().slice(0, limit)
  const context =
    typeof window === "undefined"
      ? {}
      : {
          path: window.location.pathname,
          userAgent: window.navigator.userAgent
        }

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      context,
      events
    },
    null,
    2
  )
}
