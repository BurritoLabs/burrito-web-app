import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./History.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import { fetchTxs } from "../app/data/classic"
import type { TxItem } from "../app/data/classic"
import { formatTimestamp, truncateHash } from "../app/utils/format"

const formatMsgType = (msg: any) => {
  const raw = msg?.type ?? msg?.["@type"] ?? "Transaction"
  const parts = String(raw).split(".")
  const last = parts[parts.length - 1] || raw
  return String(last).replace(/^Msg/, "")
}

const sentenceCase = (value: string) => {
  const spaced = value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const getTxMessages = (tx: TxItem) => {
  const rawMessages =
    tx.tx?.body?.messages ??
    tx.tx?.value?.msg ??
    []

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return [{ label: "Transaction", detail: "Details --" }]
  }

  return rawMessages.map((msg) => ({
    label: sentenceCase(formatMsgType(msg)),
    detail: "Details --"
  }))
}

const History = () => {
  const { account } = useWallet()
  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["txs", account?.address],
    queryFn: () => fetchTxs(account?.address ?? ""),
    enabled: Boolean(account?.address)
  })

  const items = useMemo(
    () =>
      txs.map((tx) => {
        const isSuccess = !tx.code
        return {
          hash: tx.txhash ?? "--",
          status: isSuccess ? "success" : "failed",
          time: formatTimestamp(tx.timestamp),
          messages: getTxMessages(tx)
        }
      }),
    [txs]
  )

  return (
    <PageShell title="History">
      <div className={styles.chainFilter}>
        <div className={styles.list}>
          {!account ? (
            <div className={`card ${styles.card}`}>
              <div className={styles.header}>
                <div className={styles.hash}>
                  <span className={styles.chain}>
                    <img
                      src="/brand/icon.png"
                      alt=""
                      className={styles.chainIcon}
                    />
                    Terra Classic
                  </span>
                </div>
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
                    <span className={styles.chain}>
                      <img
                        src="/brand/icon.png"
                        alt=""
                        className={styles.chainIcon}
                      />
                      Terra Classic
                    </span>
                    <span className={styles.link}>
                      {truncateHash(item.hash)}
                    </span>
                  </div>
                  <div className={styles.time}>
                    <span className={styles.timeIcon} />
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
                        <span className={styles.messageText}>{message.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.footer}>
                  <dl className={styles.details}>
                    <dt>Fee</dt>
                    <dd>--</dd>
                    <dt>Memo</dt>
                    <dd>--</dd>
                  </dl>
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
