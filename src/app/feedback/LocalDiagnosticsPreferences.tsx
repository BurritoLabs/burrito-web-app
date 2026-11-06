import { useRef, useState } from "react"
import { clearStoredTxDiagnostics } from "../tx/txDiagnostics"
import styles from "./LocalDiagnosticsPreferences.module.css"

type ClearState = "idle" | "confirm" | "cleared" | "failed"

export default function LocalDiagnosticsPreferences() {
  const [state, setState] = useState<ClearState>("idle")
  const trigger = useRef<HTMLButtonElement>(null)

  const cancel = () => {
    setState("idle")
    trigger.current?.focus()
  }

  const clear = () => {
    setState(clearStoredTxDiagnostics() ? "cleared" : "failed")
    trigger.current?.focus()
  }

  return (
    <section aria-labelledby="local-diagnostics-heading" className={styles.preferences}>
      <h2 id="local-diagnostics-heading">Local transaction diagnostics</h2>
      <p>
        This web app keeps up to 50 recent diagnostic records in this browser
        or embedded web view, even when optional sharing is off. They may
        include public wallet addresses, transaction hashes and original errors.
      </p>
      <p className={styles.scope}>
        Clearing these records does not remove wallets, change sharing
        preferences, clear your clipboard, or delete reports already sent.
        New transaction activity can create new records.
      </p>
      <div>
        <button
          ref={trigger}
          className={styles.button}
          type="button"
          aria-expanded={state === "confirm"}
          onClick={() => setState("confirm")}
        >
          Clear local diagnostics
        </button>
      </div>
      {state === "confirm" ? (
        <div className={styles.confirmation} role="group" aria-labelledby="clear-diagnostics-heading">
          <h3 id="clear-diagnostics-heading">Clear local diagnostic records?</h3>
          <p>This removes only this site&apos;s saved transaction diagnostics. It cannot be undone.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={cancel}>Cancel</button>
            <button type="button" className={styles.button} onClick={clear}>Clear records</button>
          </div>
        </div>
      ) : null}
      {state === "cleared" ? <p role="status">Local transaction diagnostics cleared.</p> : null}
      {state === "failed" ? (
        <p role="alert">Could not clear local diagnostics. Browser storage may be blocked. Please try again.</p>
      ) : null}
    </section>
  )
}
