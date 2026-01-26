import PageShell from "./PageShell"
import styles from "./History.module.css"

const History = () => {
  const items = [
    {
      title: "Swap LUNC -> USTC",
      status: "success",
      label: "Success",
      time: "2m ago"
    },
    { title: "Stake LUNC", status: "pending", label: "Pending", time: "--" },
    { title: "Send LUNC", status: "failed", label: "Failed", time: "1h ago" }
  ] as const

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
          {items.map((item) => (
            <div key={item.title} className={`card ${styles.card}`}>
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
                  <span className={styles.link}>TX#----</span>
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
          ))}
        </div>
      </div>
    </PageShell>
  )
}

export default History
