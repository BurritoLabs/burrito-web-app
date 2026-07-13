import { useMemo, type ReactNode } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../History.module.css"
import { useWallet } from "../../app/wallet/WalletContext"
import {
  fetchContractInfo,
  fetchTxHistoryPage,
  fetchValidators
} from "../../app/data/classic"
import type { CoinBalance, TxItem, ValidatorItem } from "../../app/data/classic"
import {
  useCw20Contracts,
  useResolvedCw20Whitelist,
  useResolvedIbcWhitelist
} from "../../app/data/terraAssets"
import {
  formatTokenAmount,
  truncateHash
} from "../../app/utils/format"
import { CLASSIC_CHAIN } from "../../app/chain"
import { fromBech32, toBech32 } from "@cosmjs/encoding"
import {
  createActionRuleSet,
  createLogMatcherForActions
} from "@terra-money/log-finder-ruleset"
import {
  buildCanonicalMessages,
  collectContractCandidates,
  CONTRACT_LABEL_LOOKUP_LIMIT,
  decodeEventValue,
  formatCoins,
  formatDenom,
  formatHistoryTimestamp,
  formatMsgType,
  getRawMessages,
  getSignMode,
  HISTORY_TX_LIMIT,
  isAddressToken,
  parseTokenWord,
  replaceMultipleTokens,
  retryBackoff,
  sentenceCase,
  shortenAddress,
  type HistoryMessage,
  type TokenLookup,
  type TxMessage
} from "../../app/history/historyFormat"
import { useAppChain } from "../../app/appChainContext"
import { getActiveAppChainKey } from "../../app/activeChain"
import { getAddressExplorerUrl, getTxExplorerUrl } from "../../app/explorer"

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
      href={getAddressExplorerUrl(getActiveAppChainKey(), address)}
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

const History = () => {
  const { chain, chainKey } = useAppChain()
  const { account } = useWallet()
  const actionRuleSet = useMemo(() => createActionRuleSet("mainnet"), [])
  const logMatcher = useMemo(
    () => createLogMatcherForActions(actionRuleSet),
    [actionRuleSet]
  )
  const {
    data: txPages,
    isError: isTxError,
    isLoading,
    refetch: refetchTxs,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["txs", chain.chainId, account?.address],
    queryFn: ({ pageParam }) =>
      fetchTxHistoryPage(
        account?.address ?? "",
        pageParam,
        HISTORY_TX_LIMIT
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: Boolean(account?.address),
    retry: 3,
    retryDelay: retryBackoff,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false
  })

  const txs = useMemo(() => {
    const merged = new Map<string, TxItem>()
    txPages?.pages.forEach((page) => {
      page.items.forEach((tx) => {
        if (tx.txhash && !merged.has(tx.txhash)) {
          merged.set(tx.txhash, tx)
        }
      })
    })
    return Array.from(merged.values()).sort(
      (a, b) => Number(b.height ?? 0) - Number(a.height ?? 0)
    )
  }, [txPages?.pages])

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
    queryKey: ["validators", chain.chainId],
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
    queryKey: ["contract-labels", chain.chainId, account?.address, relevantCw20Contracts.join(",")],
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
          ) : isTxError ? (
            <div className={`card ${styles.card}`}>
              <div className={styles.messages}>
                <div className={styles.message}>
                  <div className={styles.messageBody}>
                    <strong>History temporarily unavailable</strong>
                    <span>The chain API did not return transaction data. Try again in a moment.</span>
                    <button
                      className={styles.retryButton}
                      type="button"
                      onClick={() => void refetchTxs()}
                    >
                      Retry
                    </button>
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
            <>
              {items.map((item) => (
                <div key={item.hash} className={`card ${styles.card}`}>
                  <div className={styles.header}>
                    <div className={styles.hash}>
                      <a
                        className={styles.txLink}
                        href={getTxExplorerUrl(chainKey, item.hash)}
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
              ))}
              {hasNextPage ? (
                <div className={styles.loadMoreRow}>
                  <button
                    className={styles.retryButton}
                    type="button"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? "Loading..." : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}

export default History
