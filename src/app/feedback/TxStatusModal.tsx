import { createPortal } from "react-dom"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import styles from "./TxStatusModal.module.css"
import { useWallet, type TxState } from "../wallet/WalletContext"
import { buildTxDiagnosticsReport } from "../tx/txDiagnostics"
import { useAppChain } from "../appChainContext"
import { getTxExplorerUrl } from "../explorer"

const formatHash = (hash: string) =>
  `${hash.slice(0, 10)}...${hash.slice(-8)}`

type CopyAttempt = {
  transaction: TxState
  state: "copying" | "copied" | "failed"
}

const TxStatusModal = () => {
  const { chainKey } = useAppChain()
  const { txState, clearTx } = useWallet()
  const [copyAttempt, setCopyAttempt] = useState<CopyAttempt | null>(null)
  const copyState = copyAttempt?.transaction === txState ? copyAttempt.state : "idle"
  const titleId = useId()
  const copyNoticeId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  const status = txState.status
  const isPending = status === "pending"
  const isSuccess = status === "success"
  const isError = status === "error"
  const visible = status !== "idle"

  const dismiss = useCallback(() => {
    setCopyAttempt(null)
    clearTx()
  }, [clearTx])
  const closeRef = useRef({ dismiss, isPending })

  useEffect(() => {
    closeRef.current = { dismiss, isPending }
  }, [dismiss, isPending])

  useEffect(() => {
    if (!visible) return
    const modal = modalRef.current
    if (!modal) return
    const previousFocus = document.activeElement
    modal.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        // Pending broadcasts remain visible; dismissing never cancels a transaction.
        if (!closeRef.current.isPending) closeRef.current.dismiss()
        return
      }
      if (event.key !== "Tab") return
      const controls = [...modal.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]"
      )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      const active = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        modal.focus({ preventScroll: true })
      } else if (event.shiftKey && (active === first || active === modal || !modal.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || active === modal || !modal.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [visible])

  useEffect(() => {
    const modal = modalRef.current
    // A status change can remove the focused action without closing the dialog.
    // Keep the original restoration target owned by the visibility effect above.
    if (visible && modal && !modal.contains(document.activeElement)) {
      modal.focus({ preventScroll: true })
    }
  }, [visible, status, copyState])

  const title = useMemo(() => {
    if (isPending) return "Broadcasting transaction"
    if (isSuccess) return "Transaction submitted"
    if (isError) return "Transaction failed"
    return ""
  }, [isError, isPending, isSuccess])

  const copyDiagnostics = async () => {
    const attempt: CopyAttempt = { transaction: txState, state: "copying" }
    setCopyAttempt(attempt)
    try {
      await window.navigator.clipboard.writeText(buildTxDiagnosticsReport())
      setCopyAttempt((current) => current === attempt ? { ...attempt, state: "copied" } : current)
    } catch {
      setCopyAttempt((current) => current === attempt ? { ...attempt, state: "failed" } : current)
    }
  }

  if (!visible || typeof document === "undefined") return null

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {!isPending ? (
          <button
            type="button"
            className={styles.closeButton}
            onClick={dismiss}
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

        <h3 id={titleId} className={styles.title}>{title}</h3>
        <p className={styles.detail}>
          {isError
            ? txState.error || "Transaction failed. Please try again."
            : txState.label || "Please wait while the transaction is processed."}
        </p>

        {txState.hash ? (
          <a
            className={styles.hashLink}
            href={getTxExplorerUrl(chainKey, txState.hash)}
            target="_blank"
            rel="noreferrer"
          >
            {formatHash(txState.hash)}
          </a>
        ) : null}

        {isError ? (
          <div className={styles.diagnostics}>
            <p id={copyNoticeId} className={styles.copyNotice}>
              The report may include up to eight recent diagnostic records,
              public addresses, transaction hashes and original errors.
              Review it before sharing. Copying does not upload the report.
            </p>
            <button
              type="button"
              className={styles.diagnosticsButton}
              onClick={() => void copyDiagnostics()}
              aria-describedby={copyNoticeId}
              disabled={copyState === "copying"}
            >
              {copyState === "copying" ? "Copying…" : copyState === "copied" ? "Diagnostics copied" : "Copy diagnostics"}
            </button>
            {copyState === "failed" ? (
              <span role="status" className={styles.diagnosticsNote}>
                Copy failed. Clipboard access may be unavailable. Please try again.
              </span>
            ) : null}
          </div>
        ) : null}

        {!isPending ? (
          <button
            type="button"
            className={`uiButton uiButtonPrimary ${styles.confirmButton}`}
            onClick={dismiss}
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
