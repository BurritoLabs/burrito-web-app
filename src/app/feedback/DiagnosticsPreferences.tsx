import { useState, useSyncExternalStore } from "react"
import {
  getDiagnosticsConsent,
  setDiagnosticsConsent,
  subscribeDiagnosticsConsent
} from "./diagnosticsConsent"
import styles from "./DiagnosticsPreferences.module.css"

const getServerConsent = () => false

export default function DiagnosticsPreferences() {
  const enabled = useSyncExternalStore(
    subscribeDiagnosticsConsent,
    getDiagnosticsConsent,
    getServerConsent
  )
  const [failedChoice, setFailedChoice] = useState<boolean>()

  const saveChoice = (choice: boolean) => {
    setFailedChoice(setDiagnosticsConsent(choice) ? undefined : choice)
  }

  const toggleDiagnostics = () => {
    saveChoice(!enabled)
  }

  return (
    <section aria-labelledby="diagnostics-heading" className={styles.preferences}>
      <div className={styles.heading}>
        <h2 id="diagnostics-heading">Optional diagnostics</h2>
        <span className={styles.badge}>Your choice</span>
      </div>
      <p id="diagnostics-description">
        Help improve Burrito by sharing performance measurements and error
        reports with our configured diagnostics service. Reports can include
        page paths, the selected network, browser information, and transaction
        diagnostic details. Sharing is off unless you turn it on.
      </p>
      <div className={styles.controlRow}>
        <span id="diagnostics-label">Share optional diagnostics</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="diagnostics-label"
          aria-describedby="diagnostics-description diagnostics-scope"
          className={styles.toggle}
          onClick={toggleDiagnostics}
        >
          <span aria-hidden="true">{enabled ? "On" : "Off"}</span>
          <span aria-hidden="true" className={styles.track}>
            <span className={styles.thumb} />
          </span>
        </button>
      </div>
      <p id="diagnostics-scope" className={styles.scope}>
        Saved for this browser or embedded web view only. You can turn sharing
        off here at any time; this stops new reports, not reports already sent.
        Wallet features still work with sharing off.
      </p>
      {failedChoice !== undefined ? (
        <div className={styles.error}>
          <p role="alert">
            Your {failedChoice ? "On" : "Off"} choice could not be saved.
            Sharing is off on this page, but a previous saved choice may still
            apply after reloading.
          </p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => saveChoice(failedChoice)}
          >
            Retry saving choice
          </button>
        </div>
      ) : null}
    </section>
  )
}
