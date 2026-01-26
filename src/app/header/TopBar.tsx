import styles from "./TopBar.module.css"

const TopBar = () => {
  return (
    <div className={styles.bar}>
      <div className={styles.status}>
        <div className={styles.networkChip}>Terra Classic</div>
        <div className={styles.heightPill}>
          Height <strong>--</strong>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.ghostButton}>Preferences</button>
        <button className={styles.primaryButton}>Connect Wallet</button>
      </div>
    </div>
  )
}

export default TopBar
