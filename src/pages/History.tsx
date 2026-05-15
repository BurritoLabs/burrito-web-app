import { useMemo, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./History.module.css"
import { useWallet } from "../app/wallet/WalletContext"
import { fetchTxs, fetchValidators, fetchContractInfo } from "../app/data/classic"
import type { CoinBalance, TxItem, ValidatorItem } from "../app/data/classic"
import {
  useCw20Contracts,
  useResolvedCw20Whitelist,
  useResolvedIbcWhitelist
} from "../app/data/terraAssets"
import {
  formatTokenAmount,
  truncateHash
} from "../app/utils/format"
import { CLASSIC_DENOMS, CLASSIC_CHAIN } from "../app/chain"
import { fromBech32, toBech32 } from "@cosmjs/encoding"
import {
  createActionRuleSet,
  createLogMatcherForActions,
  getTxCanonicalMsgs
} from "@terra-money/log-finder-ruleset"

const HISTORY_TX_LIMIT = 50
const CONTRACT_LABEL_LOOKUP_LIMIT = 36
const CONTRACT_ADDRESS_EVENT_KEYS = new Set([
  "_contract_address",
  "contract_address",
  "contract"
])

type LogFinderTransaction = Parameters<typeof getTxCanonicalMsgs>[0]
type LogFinderTxLog = NonNullable<LogFinderTransaction["logs"]>[number]
type LogFinderTxEvent = LogFinderTxLog["events"][number]
type LogFinderTxAttribute = LogFinderTxEvent["attributes"][number]

type HistoryMessage = {
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

const formatMsgType = (value: string) => {
  const raw = String(value)
  const slashParts = raw.split("/")
  const slashLast = slashParts[slashParts.length - 1] || raw
  const dotParts = slashLast.split(".")
  const last = dotParts[dotParts.length - 1] || slashLast
  const cleaned = String(last).replace(/^Msg/, "")
  if (cleaned.toLowerCase() === "multi-send") return "Send"
  return cleaned
}

const sentenceCase = (value: string) => {
  const spaced = value
    .replace(/[_-]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const formatDenom = (denom: string) => {
  if (!denom) return "--"
  if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) return "LUNC"
  if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) return "USTC"
  if (denom.startsWith("u")) {
    const base = denom.slice(1)
    if (base.length > 3) return base.toUpperCase()
    return `${base.slice(0, 2).toUpperCase()}T`
  }
  if (denom.startsWith("ibc/")) return "IBC"
  return denom.toUpperCase()
}

const formatCoins = (coins: CoinBalance[] = []) => {
  if (!coins.length) return "--"
  return coins
    .map((coin) => {
      const amount = formatTokenAmount(coin.amount, 6, 6)
      return `${amount} ${formatDenom(coin.denom)}`
    })
    .join(", ")
}

const shortenAddress = (value?: string) => truncateHash(value, 6, 4)

const decodeEventValue = (value?: string) => {
  if (!value) return ""
  try {
    if (typeof atob === "function") {
      const decoded = atob(value)
      if (/^[\x20-\x7E]+$/.test(decoded)) return decoded
    }
  } catch {
    // ignore
  }
  return value
}

const normalizeTxLogs = (
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
      attributes: (event?.attributes ?? []).map((attr: RawTxAttribute): LogFinderTxAttribute => ({
        key: decodeEventValue(attr?.key),
        value: decodeEventValue(attr?.value)
      }))
    }))
  }))
}

const getRawMessages = (tx: TxItem): HistoryMessage[] => {
  const bodyMessages = tx.tx?.body?.messages
  if (Array.isArray(bodyMessages)) return bodyMessages
  const legacyMessages = tx.tx?.value?.msg
  if (Array.isArray(legacyMessages)) return legacyMessages
  return []
}

const buildCanonicalMessages = (
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

const isAddressToken = (token: string) => {
  if (!token) return false
  try {
    const { prefix } = fromBech32(token)
    return prefix.startsWith(CLASSIC_CHAIN.bech32Prefix)
  } catch {
    return false
  }
}

const replaceMultipleTokens = (line: string) => {
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

type TokenLookup = {
  symbol?: string
  decimals?: number
}

const parseTokenWord = (value: string) => {
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

const renderCanonicalLine = (
  line: string,
  resolveName?: (address?: string) => string | undefined,
  resolveToken?: (denom: string) => TokenLookup | undefined
) => {
  const normalized = replaceMultipleTokens(line)
  const rawWords = normalized.split(" ").filter(Boolean)
  return (
    <span className={styles.messageLine}>
      {rawWords.map((word, index) => {
        const tokenInfo = parseTokenWord(word)
        if (tokenInfo?.type === "multi") {
          return (
            <span key={`${word}-${index}`} className={styles.messagePart}>
              {index > 0 ? " " : ""}
              {"multiple tokens"}
            </span>
          )
        }
        if (tokenInfo?.type === "single") {
          const meta = resolveToken?.(tokenInfo.denom)
          const decimals = meta?.decimals ?? 6
          const symbol = meta?.symbol ?? formatDenom(tokenInfo.denom)
          const amount = formatTokenAmount(tokenInfo.amount, decimals, 6)
          return (
            <span key={`${word}-${index}`} className={styles.messagePart}>
              {index > 0 ? " " : ""}
              {`${amount} ${symbol}`}
            </span>
          )
        }

        const match = word.match(/^([a-z0-9/]+)([^a-z0-9/]*)$/i)
        const core = match?.[1] ?? word
        const suffix = match?.[2] ?? ""

        const isAddress = isAddressToken(core)
        const content = isAddress
          ? renderAddressOrText(core, resolveName?.(core) ?? shortenAddress(core))
          : core

        return (
          <span key={`${word}-${index}`} className={styles.messagePart}>
            {index > 0 ? " " : ""}
            {content}
            {suffix ? suffix : null}
          </span>
        )
      })}
    </span>
  )
}

const formatHistoryTimestamp = (timestamp?: string) => {
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

type TxMessage = {
  label: string
  lines: Array<string | ReactNode>
}

const renderActionLine = (parts: Array<string | ReactNode>) => {
  const filtered = parts.filter((part) => part !== "")
  return (
    <span className={styles.messageLine}>
      {filtered.map((part, index) => (
        <span key={index} className={styles.messagePart}>
          {part}
        </span>
      ))}
    </span>
  )
}

const renderPlainText = (text?: string) => {
  if (!text) return "--"
  return <span className={styles.plainText}>{text}</span>
}

const renderAddressLink = (address?: string, label?: string) => {
  if (!address) return renderPlainText(label ?? "--")
  const display = label ?? shortenAddress(address)
  return (
    <a
      className={styles.addressLink}
      href={`https://finder.burrito.money/classic/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className={styles.addressText}>{display}</span>
    </a>
  )
}

const renderAddressOrText = (address?: string, label?: string) => {
  if (!address) return renderPlainText(label ?? "--")
  if (label && label.toLowerCase() === "my wallet") {
    return renderAddressLink(address, "My wallet")
  }
  return renderAddressLink(address, label)
}

const buildMessage = (
  msg: HistoryMessage,
  resolveName?: (address?: string) => string | undefined
): TxMessage => {
  const rawType = msg?.["@type"] ?? msg?.type ?? "Transaction"
  const type = sentenceCase(formatMsgType(rawType))

  const from = msg?.from_address ?? msg?.delegator_address ?? msg?.sender
  const to = msg?.to_address ?? msg?.recipient ?? msg?.receiver
  const amount = Array.isArray(msg?.amount) ? msg.amount : msg?.amount ? [msg.amount] : []

  if (rawType.includes("MsgSend")) {
    const multi = Array.isArray(amount) && amount.length > 1
    return {
      label: type,
      lines: [
        renderActionLine([
          renderAddressOrText(from, resolveName?.(from)),
          multi ? "send multiple tokens to" : "send",
          multi ? renderAddressOrText(to, resolveName?.(to)) : formatCoins(amount),
          multi ? "" : "to",
          multi ? "" : renderAddressOrText(to, resolveName?.(to))
        ])
      ]
    }
  }

  if (rawType.includes("MsgMultiSend")) {
    return {
      label: type,
      lines: [
        renderActionLine([
          renderAddressOrText(from, resolveName?.(from)),
          "send multiple tokens to multiple recipients"
        ])
      ]
    }
  }

  if (rawType.includes("MsgDelegate")) {
    return {
      label: type,
      lines: [
        renderActionLine([
          renderAddressOrText(msg?.delegator_address, resolveName?.(msg?.delegator_address)),
          "delegate",
          formatCoins(amount),
          "to",
          renderAddressOrText(msg?.validator_address, resolveName?.(msg?.validator_address))
        ])
      ]
    }
  }

  if (rawType.includes("MsgUndelegate")) {
    return {
      label: type,
      lines: [
        renderActionLine([
          renderAddressOrText(msg?.delegator_address, resolveName?.(msg?.delegator_address)),
          "undelegate",
          formatCoins(amount),
          "from",
          renderAddressOrText(msg?.validator_address, resolveName?.(msg?.validator_address))
        ])
      ]
    }
  }

  if (rawType.includes("MsgBeginRedelegate")) {
    return {
      label: type,
      lines: [
        renderActionLine([
          renderAddressOrText(msg?.delegator_address, resolveName?.(msg?.delegator_address)),
          "redelegate",
          formatCoins(amount),
          "to",
          renderAddressOrText(msg?.validator_dst_address, resolveName?.(msg?.validator_dst_address))
        ])
      ]
    }
  }

  if (rawType.includes("MsgWithdrawDelegatorReward")) {
    return {
      label: "Withdraw delegation reward",
      lines: [
        renderActionLine([
          "Withdraw multiple tokens from",
          renderAddressOrText(msg?.validator_address, resolveName?.(msg?.validator_address))
        ])
      ]
    }
  }

  if (rawType.includes("MsgExecuteContract")) {
    return {
      label: "Execute contract",
      lines: [
        renderActionLine([
          renderAddressOrText(msg?.sender, resolveName?.(msg?.sender)),
          "execute contract",
          renderAddressOrText(
            msg?.contract ?? msg?.contract_address,
            resolveName?.(msg?.contract ?? msg?.contract_address)
          )
        ])
      ]
    }
  }

  if (rawType.includes("MsgTransfer")) {
    const token = msg?.token ? [msg.token] : amount
    return {
      label: "IBC transfer",
      lines: [
        renderActionLine([
          renderAddressOrText(msg?.sender, resolveName?.(msg?.sender)),
          "send",
          formatCoins(token),
          "to",
          renderAddressOrText(msg?.receiver, resolveName?.(msg?.receiver))
        ])
      ]
    }
  }

  if (rawType.includes("MsgVote")) {
    const option = msg?.option ?? msg?.options?.[0]?.option
    return {
      label: "Vote",
      lines: [
        renderActionLine([
          renderAddressOrText(msg?.voter, resolveName?.(msg?.voter)),
          "vote",
          option ? sentenceCase(String(option)) : "Vote option"
        ])
      ]
    }
  }

  return {
    label: type,
    lines: ["Details --", "--"]
  }
}

const getTxMessages = (
  tx: TxItem,
  resolveName?: (address?: string) => string | undefined,
  accountAddress?: string,
  includeEventTransfers = true
): TxMessage[] => {
  const rawMessages = getRawMessages(tx)

  const sendActions: Array<{
    sender?: string
    recipient?: string
    amounts?: CoinBalance[]
    multiRecipients?: boolean
  }> = []
  const sendKeys = new Set<string>()

  if (includeEventTransfers && Array.isArray(tx.events)) {
    tx.events
      .filter((event) => event?.type === "transfer")
      .forEach((event) => {
        const attrs = event.attributes ?? []
        const getAttr = (key: string) =>
          decodeEventValue(
            attrs.find((attr) => decodeEventValue(attr.key) === key)?.value
          )
        const sender = getAttr("sender")
        const recipient = getAttr("recipient")
        const amountRaw = getAttr("amount") ?? ""
          const coins: CoinBalance[] = amountRaw
            .split(",")
            .filter(Boolean)
            .map((entry: string) => {
              const match = entry.match(/^([0-9]+)([a-zA-Z0-9/]+)$/)
              return match
                ? { amount: match[1], denom: match[2] }
                : { amount: entry, denom: "" }
            })
        if (!recipient) return
        const key = `${sender ?? ""}|${recipient ?? ""}|${amountRaw}`
        if (sendKeys.has(key)) return
        sendKeys.add(key)
        sendActions.push({
          sender,
          recipient,
          amounts: coins
        })
      })
  }

  const otherMessages: TxMessage[] = []
  if (Array.isArray(rawMessages)) {
    rawMessages.forEach((msg) => {
      const type = String(msg?.["@type"] ?? msg?.type ?? "")
      if (type.includes("MsgSend")) {
        const amounts = Array.isArray(msg?.amount)
          ? msg.amount
          : msg?.amount
            ? [msg.amount]
            : []
        const key = `${msg?.from_address ?? ""}|${msg?.to_address ?? ""}|${formatCoins(amounts)}`
        if (!sendKeys.has(key)) {
          sendKeys.add(key)
          sendActions.push({
            sender: msg?.from_address,
            recipient: msg?.to_address,
            amounts
          })
        }
        return
      }
      if (type.includes("MsgMultiSend")) {
        const amounts = msg?.outputs?.[0]?.coins ?? []
        const key = `${msg?.inputs?.[0]?.address ?? ""}|${msg?.outputs?.[0]?.address ?? ""}|${formatCoins(amounts)}|multi`
        if (!sendKeys.has(key)) {
          sendKeys.add(key)
          sendActions.push({
            sender: msg?.inputs?.[0]?.address,
            recipient: msg?.outputs?.[0]?.address,
            amounts,
            multiRecipients: true
          })
        }
        return
      }
      otherMessages.push(buildMessage(msg, resolveName))
    })
  }

  const consolidated: TxMessage[] = []
  if (sendActions.length) {
    const sender =
      sendActions.find((item) => item.sender && item.sender !== tx.tx?.body?.memo)
        ?.sender ?? sendActions[0]?.sender
    const recipient =
      sendActions.find((item) => item.recipient === accountAddress)?.recipient ??
      sendActions[0]?.recipient
    const multiTokens =
      sendActions.length > 1 ||
      sendActions.some((item) => (item.amounts?.length ?? 0) > 1) ||
      sendActions.some((item) => item.multiRecipients)
    const recipientSet = new Set(
      sendActions
        .map((item) => item.recipient)
        .filter((value) => Boolean(value))
    )
    const multipleRecipients = recipientSet.size > 1

    const recipientLabel =
      recipient === accountAddress ? "My wallet" : resolveName?.(recipient)
    const recipientNode =
      recipient === accountAddress
        ? renderAddressOrText(recipient, "My wallet")
        : multiTokens && multipleRecipients
          ? renderPlainText("multiple recipients")
          : renderAddressOrText(recipient, recipientLabel ?? shortenAddress(recipient))
    const senderLabel =
      sender === accountAddress ? "My wallet" : resolveName?.(sender)
    const senderNode = renderAddressOrText(sender, senderLabel ?? shortenAddress(sender))

    consolidated.push({
      label: "Send",
      lines: [
        renderActionLine([
          senderNode,
          multiTokens ? "send multiple tokens to" : "send",
          multiTokens ? recipientNode : formatCoins(sendActions[0]?.amounts ?? []),
          multiTokens ? "" : "to",
          multiTokens ? "" : recipientNode
        ])
      ]
    })
  }

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return consolidated.length
      ? consolidated
      : [{ label: "Transaction", lines: ["Details --"] }]
  }

  return [...consolidated, ...otherMessages]
}

const getSignMode = (tx: TxItem) => {
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

const normalizeContractCandidate = (value?: unknown) => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith("terra1") ? normalized : undefined
}

const collectContractCandidates = (txs: TxItem[]) => {
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

const History = () => {
  const { account } = useWallet()
  const actionRuleSet = useMemo(() => createActionRuleSet("mainnet"), [])
  const logMatcher = useMemo(
    () => createLogMatcherForActions(actionRuleSet),
    [actionRuleSet]
  )
  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["txs", account?.address],
    queryFn: () => fetchTxs(account?.address ?? "", HISTORY_TX_LIMIT),
    enabled: Boolean(account?.address),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false
  })

  const contractCandidates = useMemo(() => collectContractCandidates(txs), [txs])
  const relevantCw20Contracts = useMemo(
    () => contractCandidates.slice(0, CONTRACT_LABEL_LOOKUP_LIMIT),
    [contractCandidates]
  )

  const { data: cw20Whitelist = {} } = useResolvedCw20Whitelist(relevantCw20Contracts)
  const { data: cw20Contracts = {} } = useCw20Contracts()
  const ibcDenoms = useMemo(() => {
    const denoms = new Set<string>()
    txs.forEach((tx) => {
      const messages = getRawMessages(tx)
      messages.forEach((message) => {
        const amounts = Array.isArray(message?.amount)
          ? message.amount
          : message?.amount
            ? [message.amount]
            : []
        amounts.forEach((coin) => {
          if (coin?.denom?.startsWith("ibc/")) denoms.add(coin.denom)
        })
      })
    })
    return Array.from(denoms)
  }, [txs])
  const { data: ibcWhitelist = {} } = useResolvedIbcWhitelist(ibcDenoms)

  const { data: validators = [] } = useQuery<ValidatorItem[]>({
    queryKey: ["validators"],
    queryFn: () => fetchValidators(),
    enabled: Boolean(account?.address) && txs.length > 0,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false
  })

  const validatorNameMap = useMemo(() => {
    const map = new Map<string, string>()
    validators.forEach((validator) => {
      const name = validator.description?.moniker
      if (!name) return
      const operator = validator.operator_address
      if (!operator) return
      map.set(operator, name)
      try {
        const { data } = fromBech32(operator)
        const accountAddr = toBech32(CLASSIC_CHAIN.bech32Prefix, data)
        map.set(accountAddr, name)
      } catch {
        if (operator.includes("valoper")) {
          const fallbackAddr = operator.replace("valoper", "")
          map.set(fallbackAddr, name)
        }
      }
    })
    return map
  }, [validators])

  const { data: contractLabels = {} } = useQuery<Record<string, string>>({
    queryKey: ["contract-labels", account?.address, relevantCw20Contracts.join(",")],
    queryFn: async () => {
      const entries = relevantCw20Contracts
      if (!entries.length) return {}
      const results: Record<string, string> = {}
      for (let i = 0; i < entries.length; i += 6) {
        const batch = entries.slice(i, i + 6)
        const batchResults = await Promise.all(
          batch.map(async (address) => {
            try {
              const info = await fetchContractInfo(address)
              const label = info?.label ?? undefined
              return [address, label] as const
            } catch {
              return [address, undefined] as const
            }
          })
        )
        batchResults.forEach(([address, label]) => {
          if (label) results[address] = label
        })
      }
      return results
    },
    enabled: relevantCw20Contracts.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false
  })

  const contractNameMap = useMemo(() => {
    const map = new Map<string, string>()
    Object.entries(cw20Contracts ?? {}).forEach(([address, contract]) => {
      const label = contract?.name ?? contract?.protocol
      if (label) map.set(address, label)
    })
    Object.entries(cw20Whitelist ?? {}).forEach(([address, token]) => {
      const label =
        token?.name ??
        (token?.protocol && token?.symbol
          ? `${token.protocol} ${token.symbol}`
          : token?.symbol ?? token?.protocol)
      if (label && !map.has(address)) map.set(address, label)
    })
    return map
  }, [cw20Contracts, cw20Whitelist])

  const tokenLookupMap = useMemo(() => {
    const map = new Map<string, TokenLookup>()
    Object.entries(cw20Whitelist ?? {}).forEach(([address, token]) => {
      map.set(address, {
        symbol: token?.symbol ?? token?.name ?? token?.protocol,
        decimals: token?.decimals ?? 6
      })
    })
    Object.entries(ibcWhitelist ?? {}).forEach(([denom, token]) => {
      map.set(denom, {
        symbol: token?.symbol ?? token?.name,
        decimals: token?.decimals ?? 6
      })
    })
    return map
  }, [cw20Whitelist, ibcWhitelist])

  const resolveName = useMemo(
    () => (address?: string) => {
      if (!address) return undefined
      if (account?.address && address === account.address) return "My wallet"
      const validatorName = validatorNameMap.get(address)
      if (validatorName) return validatorName
      try {
        const { data } = fromBech32(address)
        const operatorAddr = toBech32(`${CLASSIC_CHAIN.bech32Prefix}valoper`, data)
        const operatorName = validatorNameMap.get(operatorAddr)
        if (operatorName) return operatorName
      } catch {
        // ignore
      }
      const contractName = contractNameMap.get(address)
      if (contractName) return contractName
      const contractLabel = contractLabels[address]
      if (contractLabel && contractLabel !== address) return contractLabel
      return undefined
    },
    [account, validatorNameMap, contractNameMap, contractLabels]
  )

  const resolveToken = useMemo(
    () => (denom: string) => {
      const meta = tokenLookupMap.get(denom)
      if (meta) return meta
      if (isAddressToken(denom)) {
        const name = contractNameMap.get(denom)
        if (name) return { symbol: name, decimals: 6 }
        return { symbol: truncateHash(denom, 6, 4), decimals: 6 }
      }
      return undefined
    },
    [tokenLookupMap, contractNameMap]
  )

  const items = useMemo(
    () =>
      txs.map((tx) => {
        const isSuccess = !tx.code
        const rawMessages = getRawMessages(tx)
        const hasStakingAction = Array.isArray(rawMessages)
          ? rawMessages.some((msg) => {
              const type = String(msg?.["@type"] ?? msg?.type ?? "")
              return (
                type.includes("MsgDelegate") ||
                type.includes("MsgUndelegate") ||
                type.includes("MsgBeginRedelegate")
              )
            })
          : false
        const canonicalMessages = hasStakingAction
          ? []
          : buildCanonicalMessages(tx, logMatcher, (line) =>
              renderCanonicalLine(line, resolveName, resolveToken)
            )
        return {
          hash: tx.txhash ?? "--",
          status: isSuccess ? "success" : "failed",
          time: formatHistoryTimestamp(tx.timestamp),
          messages: canonicalMessages.length
            ? canonicalMessages
            : getTxMessages(tx, resolveName, account?.address, !hasStakingAction),
          fee: formatCoins(tx.tx?.auth_info?.fee?.amount ?? []),
          memo: tx.tx?.body?.memo ?? "",
          log: tx.code ? tx.raw_log ?? "" : "",
          signMode: getSignMode(tx)
        }
      }),
    [txs, resolveName, resolveToken, logMatcher, account?.address]
  )

  return (
    <PageShell title="History">
      <div className={styles.chainFilter}>
        <div className={styles.list}>
            {!account ? (
              <div className={`card ${styles.card}`}>
                <div className={styles.header}>
                  <div className={styles.hash} />
                </div>
                <div className={styles.messages}>
                  <div className={styles.message}>
                  <div className={styles.messageBody}>
                    <strong>Connect wallet to view history</strong>
                    <span>Transactions will show here</span>
                  </div>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            <div className={`card ${styles.card}`}>
              <div className={styles.messages}>
                <div className={styles.message}>
                  <div className={styles.messageBody}>
                    <strong>Loading transactions...</strong>
                    <span>Please wait</span>
                  </div>
                </div>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className={`card ${styles.card}`}>
              <div className={styles.messages}>
                <div className={styles.message}>
                  <div className={styles.messageBody}>
                    <strong>No transactions</strong>
                    <span>Activity will appear here</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
              items.map((item) => (
                <div key={item.hash} className={`card ${styles.card}`}>
                  <div className={styles.header}>
                    <div className={styles.hash}>
                      <a
                        className={styles.txLink}
                        href={`https://finder.burrito.money/classic/tx/${item.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className={styles.txLinkText}>
                        {truncateHash(item.hash)}
                      </span>
                    </a>
                  </div>
                  <div className={styles.time}>
                    <svg
                      className={styles.timeIcon}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zm0-13H5V6h14v1z"
                      />
                    </svg>
                    {item.time}
                  </div>
                </div>
                <div className={styles.messages}>
                  {item.messages.map((message, index) => (
                    <div key={`${item.hash}-${index}`} className={styles.message}>
                      <span className={`${styles.tag} ${styles[item.status]}`}>
                        {message.label}
                      </span>
                        <div className={styles.messageBody}>
                          {message.lines.map((detail, detailIndex) => (
                            <span
                              key={`${item.hash}-${index}-${detailIndex}`}
                              className={
                                detailIndex === 0
                                  ? styles.messagePrimary
                                  : styles.messageSecondary
                              }
                            >
                              {detail}
                            </span>
                          ))}
                        </div>
                    </div>
                  ))}
                </div>
                <div className={styles.footer}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Fee</span>
                    <span className={styles.detailValue}>{item.fee || "--"}</span>
                  </div>
                  {item.memo ? (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Memo</span>
                      <span className={styles.detailValue}>{item.memo}</span>
                    </div>
                  ) : null}
                  {item.log ? (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Log</span>
                      <span className={styles.detailValue}>{item.log}</span>
                    </div>
                  ) : null}
                  {item.signMode ? (
                    <p className={styles.signMode}>
                      <svg
                        className={styles.signModeIcon}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M12 2l7 3v6c0 5.25-3.75 9.75-7 11-3.25-1.25-7-5.75-7-11V5l7-3zm-1 13l5-5-1.4-1.4L11 12.2 9.4 10.6 8 12l3 3z"
                        />
                      </svg>
                      {item.signMode}
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PageShell>
  )
}

export default History
