import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./History.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import { fetchTxs } from "../app/data/classic"
import type { TxItem } from "../app/data/classic"
import { formatTimestamp, truncateHash } from "../app/utils/format"

const formatTxType = (tx: TxItem) => {
  const raw =
    tx.tx?.value?.msg?.[0]?.type ??
    tx.tx?.body?.messages?.[0]?.["@type"] ??
    "Transaction"
  const parts = raw.split(".")
  return parts[parts.length - 1]?.replace("Msg", "") || raw
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
          title: formatTxType(tx),
          status: isSuccess ? "success" : "failed",
          label: isSuccess ? "Success" : "Failed",
          time: formatTimestamp(tx.timestamp)
        }
      }),
    [txs]
  )

  return (
    <PageShell title="History">
      <div className={styles.chainFilter}>
        <div className={styles.chainPills}>
          <button
            className={`${styles.chainPill} ${styles.chainPillActive} ${styles.chainPillAll}`}
            type="button"
          >
            All
          </button>
          <button className={styles.chainPill} type="button">
            <span className={styles.chainPillIcon} aria-hidden="true" />
            Terra Classic
          </button>
        </div>
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
                  <div className={styles.message}>
                    <span className={`${styles.tag} ${styles[item.status]}`}>
                      {item.label}
                    </span>
                    <div className={styles.messageBody}>
                      <strong>{item.title}</strong>
                      <span>Details --</span>
                    </div>
                  </div>
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
