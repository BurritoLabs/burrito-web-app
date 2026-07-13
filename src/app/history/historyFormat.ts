import type { ReactNode } from "react"
import { fromBech32 } from "@cosmjs/encoding"
import {
  getTxCanonicalMsgs,
  type createLogMatcherForActions
} from "@terra-money/log-finder-ruleset"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import type { CoinBalance, TxItem } from "../data/classic"
import { formatTokenAmount, truncateHash } from "../utils/format"
import { getActiveAppChainKey } from "../activeChain"

export const HISTORY_TX_LIMIT = 50
export const CONTRACT_LABEL_LOOKUP_LIMIT = 36

const CONTRACT_ADDRESS_EVENT_KEYS = new Set([
  "_contract_address",
  "contract_address",
  "contract"
])

export const retryBackoff = (attempt: number) =>
  Math.min(1000 * 2 ** attempt, 6000)

type LogFinderTransaction = Parameters<typeof getTxCanonicalMsgs>[0]
type LogFinderTxLog = NonNullable<LogFinderTransaction["logs"]>[number]
type LogFinderTxEvent = LogFinderTxLog["events"][number]
type LogFinderTxAttribute = LogFinderTxEvent["attributes"][number]

export type HistoryMessage = {
  "@type"?: string
  type?: string
  from_address?: string
  to_address?: string
  delegator_address?: string
  validator_address?: string
  validator_dst_address?: string
  sender?: string
  recipient?: string
  receiver?: string
  contract?: string
  contract_address?: string
  amount?: CoinBalance | CoinBalance[]
  token?: CoinBalance
  option?: string
  options?: Array<{ option?: string }>
  voter?: string
  inputs?: Array<{ address?: string; coins?: CoinBalance[] }>
  outputs?: Array<{ address?: string; coins?: CoinBalance[] }>
}

type RawTxLog = {
  msg_index?: number
  msgIndex?: number
  log?: string
  events?: RawTxEvent[]
}

type RawTxEvent = {
  type?: string
  attributes?: RawTxAttribute[]
}

type RawTxAttribute = {
  key?: string
  value?: string
}

export type TokenLookup = {
  symbol?: string
  decimals?: number
}

export type TxMessage = {
  label: string
  lines: Array<string | ReactNode>
}

export const formatMsgType = (value: string) => {
  const raw = String(value)
  const slashParts = raw.split("/")
  const slashLast = slashParts[slashParts.length - 1] || raw
  const dotParts = slashLast.split(".")
  const last = dotParts[dotParts.length - 1] || slashLast
  const cleaned = String(last).replace(/^Msg/, "")
  if (cleaned.toLowerCase() === "multi-send") return "Send"
  return cleaned
}

export const sentenceCase = (value: string) => {
  const spaced = value
    .replace(/[_-]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const formatDenom = (denom: string) => {
  if (!denom) return "--"
  if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
    return getActiveAppChainKey() === "lunc" ? "LUNC" : "LUNA"
  }
  if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) return "USTC"
  if (denom.startsWith("u")) {
    const base = denom.slice(1)
    if (base.length > 3) return base.toUpperCase()
    return `${base.slice(0, 2).toUpperCase()}T`
  }
  if (denom.startsWith("ibc/")) return "IBC"
  return denom.toUpperCase()
}

export const formatCoins = (coins: CoinBalance[] = []) => {
  if (!coins.length) return "--"
  return coins
    .map((coin) => {
      const amount = formatTokenAmount(coin.amount, 6, 6)
      return `${amount} ${formatDenom(coin.denom)}`
    })
    .join(", ")
}

export const shortenAddress = (value?: string) => truncateHash(value, 6, 4)

export const decodeEventValue = (value?: string) => {
  if (!value) return ""
  try {
    if (typeof atob === "function") {
      const decoded = atob(value)
      if (/^[\x20-\x7E]+$/.test(decoded)) return decoded
    }
  } catch {
    // Keep malformed event values untouched.
  }
  return value
}

export const normalizeTxLogs = (
  logs?: RawTxLog[],
  rawLog?: string
): LogFinderTransaction["logs"] => {
  const raw =
    logs ??
    (() => {
      if (!rawLog) return undefined
      try {
        const parsed = JSON.parse(rawLog)
        return Array.isArray(parsed) ? parsed : undefined
      } catch {
        return undefined
      }
    })()

  if (!raw) return undefined
  return raw.map((log): LogFinderTxLog => ({
    msg_index: log?.msg_index ?? log?.msgIndex ?? 0,
    log: log?.log ?? "",
    events: (log?.events ?? []).map((event: RawTxEvent): LogFinderTxEvent => ({
      type: event?.type ?? "",
      attributes: (event?.attributes ?? []).map(
        (attr: RawTxAttribute): LogFinderTxAttribute => ({
          key: decodeEventValue(attr?.key),
          value: decodeEventValue(attr?.value)
        })
      )
    }))
  }))
}

export const getRawMessages = (tx: TxItem): HistoryMessage[] => {
  const bodyMessages = tx.tx?.body?.messages
  if (Array.isArray(bodyMessages)) return bodyMessages
  const legacyMessages = tx.tx?.value?.msg
  if (Array.isArray(legacyMessages)) return legacyMessages
  return []
}

export const buildCanonicalMessages = (
  tx: TxItem,
  logMatcher: ReturnType<typeof createLogMatcherForActions> | null,
  renderLine: (line: string) => ReactNode
): TxMessage[] => {
  if (!logMatcher || !tx.tx || !tx.txhash || !tx.timestamp) return []
  const rawMessages = getRawMessages(tx)
  const logs = normalizeTxLogs(tx.logs, tx.raw_log)
  if (!logs?.length) return []

  const txInfo: LogFinderTransaction = {
    height: Number(tx.height ?? 0),
    txhash: tx.txhash,
    raw_log: tx.raw_log ?? "",
    logs,
    gas_wanted: 0,
    gas_used: 0,
    tx: {
      body: {
        messages: rawMessages,
        memo: tx.tx?.body?.memo
      },
      auth_info: {
        fee: tx.tx?.auth_info?.fee ?? {}
      }
    },
    timestamp: tx.timestamp ?? ""
  }

  const matched = getTxCanonicalMsgs(txInfo, logMatcher)
  if (!matched?.length) return []
  const flattened = matched
    .map((group) => group.map((item) => item.transformed).filter(Boolean))
    .flat()
    .filter(Boolean) as Array<{ msgType: string; canonicalMsg: string[] }>

  if (!flattened.length) return []

  return flattened.map((action) => {
    const rawLines = (action.canonicalMsg ?? []).filter((line) => line !== "")
    const wordCounts = rawLines.map((line) =>
      String(line).trim().split(/\s+/).filter(Boolean).length
    )
    const shouldJoin =
      rawLines.length > 1 &&
      wordCounts.length > 0 &&
      Math.max(...wordCounts) <= 2
    const normalizedLines = shouldJoin ? [rawLines.join(" ")] : rawLines
    return {
      label: sentenceCase(formatMsgType(action.msgType)),
      lines: normalizedLines.map((line) => renderLine(String(line)))
    }
  })
}

export const isAddressToken = (token: string) => {
  if (!token) return false
  try {
    const { prefix } = fromBech32(token)
    return prefix.startsWith(CLASSIC_CHAIN.bech32Prefix)
  } catch {
    return false
  }
}

export const replaceMultipleTokens = (line: string) => {
  if (!line) return line
  let replaced = line
  replaced = replaced.replace(/multiple\s*tokens\/[^ ]+/gi, "multiple tokens")
  replaced = replaced.replace(/tokens\/[^ ]+/gi, "multiple tokens")
  replaced = replaced.replace(/multiple\s+multiple\s+tokens/gi, "multiple tokens")
  if (/multiple tokens/i.test(replaced)) return replaced
  const multiCoinRegex =
    /(\d[\d.,]*\s?(?:[A-Za-z]{2,6}|ibc\/[0-9A-Fa-f]+))(?:\s*,\s*\d[\d.,]*\s?(?:[A-Za-z]{2,6}|ibc\/[0-9A-Fa-f]+))+/
  if (multiCoinRegex.test(replaced)) {
    return replaced.replace(multiCoinRegex, "multiple tokens")
  }
  return replaced
}

export const parseTokenWord = (value: string) => {
  const clean = value.replace(/[.,]$/, "")
  if (!clean) return null
  if (clean.toLowerCase().includes("tokens/")) {
    return { type: "multi" as const }
  }
  const parts = clean.split(",").map((part) => part.trim())
  if (parts.length > 1) {
    return { type: "multi" as const }
  }
  const match = clean.match(/^([0-9]+)([a-zA-Z0-9/]+)$/)
  if (!match) return null
  return { type: "single" as const, amount: match[1], denom: match[2] }
}

export const formatHistoryTimestamp = (timestamp?: string) => {
  if (!timestamp) return "--"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "--"
  const pad = (value: number) => String(value).padStart(2, "0")
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

export const getSignMode = (tx: TxItem) => {
  const signerInfo = tx.tx?.auth_info?.signer_infos?.[0]
  if (!signerInfo?.mode_info) return null
  const modeInfo = signerInfo.mode_info
  if (modeInfo.multi) {
    const numSignatures = modeInfo.multi.mode_infos?.length ?? 0
    const numSigners = signerInfo.public_key?.public_keys?.length ?? 0
    if (numSignatures && numSigners) {
      return `Multisig tx: signed by ${numSignatures} of ${numSigners} signers`
    }
    return "Multisig tx"
  }
  if (modeInfo.single?.mode === "SIGN_MODE_LEGACY_AMINO_JSON") {
    return "Signed with a hardware wallet"
  }
  return null
}

export const normalizeContractCandidate = (value?: unknown) => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith("terra1") ? normalized : undefined
}

export const collectContractCandidates = (txs: TxItem[]) => {
  const addresses = new Set<string>()
  txs.forEach((tx) => {
    getRawMessages(tx).forEach((message) => {
      const candidate = normalizeContractCandidate(
        message?.contract ?? message?.contract_address
      )
      if (candidate) addresses.add(candidate)
    })

    ;(tx.events ?? []).forEach((event) => {
      event.attributes?.forEach((attr) => {
        const key = decodeEventValue(attr?.key)
        if (!CONTRACT_ADDRESS_EVENT_KEYS.has(key)) return
        const candidate = normalizeContractCandidate(decodeEventValue(attr?.value))
        if (candidate) addresses.add(candidate)
      })
    })
  })
  return Array.from(addresses)
}
