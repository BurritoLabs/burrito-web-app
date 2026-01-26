import styles from "./TopBar.module.css"

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M4 12a8 8 0 0 1 13.66-5.66"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 4v4h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M4 12h2M18 12h2M12 4v2M12 18v2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const WarningIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M12 3l9 16H3l9-16z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M12 9v4M12 17h.01"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

type TopBarProps = {
  onMenuClick?: () => void
  menuOpen?: boolean
}

const TopBar = ({ onMenuClick, menuOpen }: TopBarProps) => {
  return (
    <div className={styles.bar}>
      <div className={styles.status}>
        <div className={styles.networkChip}>CLASSIC</div>
      </div>

      <div className={styles.actions}>
        <div className={styles.actionGroup}>
          <button
            className={styles.iconButton}
            aria-label="Refresh"
            type="button"
          >
            <RefreshIcon />
          </button>
          <button
            className={styles.iconButton}
            aria-label="Preferences"
            type="button"
          >
            <SettingsIcon />
          </button>
          <button
            className={styles.iconButton}
            aria-label="Network status"
            type="button"
          >
            <WarningIcon />
          </button>
        </div>
        <button
          className={`uiButton uiButtonOutline ${styles.validatorButton}`}
          type="button"
        >
          Validator
        </button>
        <button
          className={`uiButton uiButtonOutline ${styles.connectButton}`}
          type="button"
        >
          Connect
        </button>
        <button
          className={styles.menuButton}
          onClick={onMenuClick}
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          data-open={menuOpen ? "true" : "false"}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={styles.latestTx} data-visible="false" aria-hidden="true">
        <div className={styles.latestIcon} />
        <div>
          <div className={styles.latestTitle}>Latest tx</div>
          <div className={styles.latestHash}>Waiting for activity</div>
        </div>
      </div>
    </div>
  )
}

export default TopBar
