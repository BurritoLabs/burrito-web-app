import styles from "./WalletPanel.module.css"
import type { WalletPanelView } from "./walletPanelUtils"

type WalletPanelActionsProps = {
  view: WalletPanelView
  canSubmitSend: boolean
  sendSubmitting: boolean
  sendSymbol: string
  sendSubmitDisabledReason?: string
  sendRecipientReceivesSummaryDisplay: string
  onSendSubmit: () => void
  onAssetSend: () => void
  onAssetReceive: () => void
}

const WalletPanelActions = ({
  view,
  canSubmitSend,
  sendSubmitting,
  sendSymbol,
  sendSubmitDisabledReason,
  sendRecipientReceivesSummaryDisplay,
  onSendSubmit,
  onAssetSend,
  onAssetReceive
}: WalletPanelActionsProps) => {
  if (view === "send") {
    return (
      <div className={styles.actions}>
        <button
          className="uiButton uiButtonPrimary"
          type="button"
          onClick={onSendSubmit}
          disabled={!canSubmitSend}
        >
          {sendSubmitting ? "Sending..." : `Send ${sendSymbol}`}
        </button>
        <div className={styles.actionHint}>
          {sendSubmitDisabledReason ??
            `Recipient receives ${sendRecipientReceivesSummaryDisplay}`}
        </div>
      </div>
    )
  }

  if (view === "asset") {
    return (
      <div className={styles.actions}>
        <button
          className="uiButton uiButtonPrimary"
          type="button"
          onClick={onAssetSend}
        >
          Send
        </button>
        <button
          className="uiButton uiButtonOutline"
          type="button"
          onClick={onAssetReceive}
        >
          Receive
        </button>
      </div>
    )
  }

  return null
}

export default WalletPanelActions
