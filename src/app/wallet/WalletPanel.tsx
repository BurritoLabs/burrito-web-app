import styles from "./WalletPanel.module.css"

const WalletPanel = () => {
  return (
    <aside className={styles.wallet}>
      <div className={styles.header}>
        <div>
          <div className={styles.kicker}>Wallet</div>
          <h3>Connect to view balances</h3>
        </div>
        <button className={styles.connect}>Connect</button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Portfolio value</div>
        <div className={styles.cardValue}>$0.00</div>
        <div className={styles.cardMeta}>Terra Classic · LUNC</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Quick actions</div>
        <div className={styles.actionsGrid}>
          <button>Send</button>
          <button>Receive</button>
          <button>Swap</button>
          <button>Stake</button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Assets</div>
        <div className={styles.assetList}>
          <div className={styles.assetRow}>
            <div>
              <strong>LUNC</strong>
              <span>Terra Classic</span>
            </div>
            <div className={styles.assetValue}>
              <strong>0.00</strong>
              <span>$0.00</span>
            </div>
          </div>
          <div className={styles.assetRow}>
            <div>
              <strong>USTC</strong>
              <span>Stablecoin</span>
            </div>
            <div className={styles.assetValue}>
              <strong>0.00</strong>
              <span>$0.00</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default WalletPanel
