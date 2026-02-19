import { createPortal } from "react-dom"
import { useMemo } from "react"
import styles from "./TxStatusModal.module.css"
import { useWallet } from "../wallet/WalletProvider"

const formatHash = (hash: string) =>
  `${hash.slice(0, 10)}...${hash.slice(-8)}`

const TxStatusModal = () => {
  const { txState, clearTx } = useWallet()

  const status = txState.status
  const isPending = status === "pending"
  const isSuccess = status === "success"
  const isError = status === "error"
  const visible = status !== "idle"

  const title = useMemo(() => {
    if (isPending) return "Broadcasting transaction"
    if (isSuccess) return "Transaction submitted"
    if (isError) return "Transaction failed"
    return ""
  }, [isError, isPending, isSuccess])

  if (!visible || typeof document === "undefined") return null

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        {!isPending ? (
          <button
            type="button"
            className={styles.closeButton}
            onClick={clearTx}
            aria-label="Close transaction status"
          >
            <span />
            <span />
          </button>
        ) : null}

        <div className={styles.iconWrap}>
          <div
            className={`${styles.iconCircle} ${
              isPending
                ? styles.pending
                : isSuccess
                ? styles.success
                : styles.error
            }`}
          >
            {isPending ? (
              <span className={styles.spinner} />
            ) : isSuccess ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5 9.2 16.5 19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 8.5v5.5M12 17.5h.01"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10.4 3.7a1.9 1.9 0 0 1 3.2 0l7.2 12.4a1.9 1.9 0 0 1-1.6 2.9H4.8a1.9 1.9 0 0 1-1.6-2.9Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>

        <h3 className={styles.title}>{title}</h3>
        <p className={styles.detail}>
          {isError
            ? txState.error || "Transaction failed. Please try again."
            : txState.label || "Please wait while the transaction is processed."}
        </p>

        {txState.hash ? (
          <a
            className={styles.hashLink}
            href={`https://finder.burrito.money/classic/tx/${txState.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {formatHash(txState.hash)}
          </a>
        ) : null}

        {!isPending ? (
          <button
            type="button"
            className={`uiButton uiButtonPrimary ${styles.confirmButton}`}
            onClick={clearTx}
          >
            Confirm
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export default TxStatusModal
