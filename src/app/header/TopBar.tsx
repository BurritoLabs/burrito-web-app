import styles from "./TopBar.module.css"

type TopBarProps = {
  onMenuClick?: () => void
}

const TopBar = ({ onMenuClick }: TopBarProps) => {
  return (
    <div className={styles.bar}>
      <button className={styles.menuButton} onClick={onMenuClick}>
        <span />
        <span />
        <span />
      </button>
      <div className={styles.status}>
        <div className={styles.networkChip}>Terra Classic</div>
        <div className={styles.heightPill}>
          Height <strong>--</strong>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={`uiButton ${styles.ghostButton}`}>Preferences</button>
        <button className={`uiButton uiButtonPrimary ${styles.primaryButton}`}>
          Connect Wallet
        </button>
      </div>
    </div>
  )
}

export default TopBar
