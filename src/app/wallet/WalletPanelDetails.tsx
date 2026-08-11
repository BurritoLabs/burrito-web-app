import styles from "./WalletPanel.module.css"
import WalletAssetIcon from "./WalletAssetIcon"
import { BuyIcon, ReceiveIcon, SendIcon } from "./WalletPanelIcons"
import type { WalletPanelView } from "./walletPanelUtils"
import { formatUsd } from "../utils/format"

type WalletPanelDetailsProps = {
  view: WalletPanelView
  accountConnected: boolean
  netWorthValue: string
  selectedSymbol: string
  selectedIconCandidates: string[]
  selectedValue?: number
  selectedAmountDisplay: string
  onSend: () => void
  onReceive: () => void
  onBuy: () => void
}

const WalletPanelDetails = ({
  view,
  accountConnected,
  netWorthValue,
  selectedSymbol,
  selectedIconCandidates,
  selectedValue,
  selectedAmountDisplay,
  onSend,
  onReceive,
  onBuy
}: WalletPanelDetailsProps) => {
  if (view === "asset") {
    return (
      <div className={styles.details}>
        <div className={styles.assetDetails}>
          <div className={styles.assetBadgeLarge}>
            <WalletAssetIcon
              symbol={selectedSymbol}
              candidates={selectedIconCandidates}
            />
          </div>
          <div className={styles.assetDetailValue}>
            {accountConnected ? formatUsd(selectedValue) : "--"}
          </div>
          <div className={styles.assetDetailAmount}>
            {accountConnected ? `${selectedAmountDisplay} ${selectedSymbol}` : "--"}
          </div>
        </div>
      </div>
    )
  }

  if (view !== "wallet") return null

  return (
    <div className={styles.details}>
      <div className={styles.networthHeader}>
        <div>
          <div className={styles.kicker}>Portfolio value</div>
          <div className={styles.networthValue}>{netWorthValue}</div>
        </div>
      </div>

      <div className={styles.networthActions}>
        <div className={styles.actionItem}>
          <button
            aria-label="Send"
            className={`${styles.actionButton} ${styles.actionPrimary}`}
            type="button"
            onClick={onSend}
          >
            <SendIcon />
          </button>
          <span>Send</span>
        </div>
        <div className={styles.actionItem}>
          <button
            aria-label="Receive"
            className={styles.actionButton}
            type="button"
            onClick={onReceive}
          >
            <ReceiveIcon />
          </button>
          <span>Receive</span>
        </div>
        <div className={styles.actionItem}>
          <button
            aria-label="Buy"
            className={styles.actionButton}
            type="button"
            onClick={onBuy}
          >
            <BuyIcon />
          </button>
          <span>Buy</span>
        </div>
      </div>
    </div>
  )
}

export default WalletPanelDetails
