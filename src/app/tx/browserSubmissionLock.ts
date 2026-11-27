// Origin-wide rather than per account: no address, wallet identifier, payload,
// signature or transaction hash is shared. Never queue an approval for later.
export const SUBMISSION_LOCK = "burrito:active-transaction:v1"
type LockResult = { kind: "acquired"; release: () => void } | { kind: "busy" | "unavailable" }

export function tryAcquireBrowserSubmissionLock(): Promise<LockResult> {
  let manager: LockManager | undefined
  try { manager = typeof navigator !== "undefined" ? navigator.locks : undefined }
  catch { return Promise.resolve({ kind: "unavailable" }) }
  if (!manager) {
    // Older browsers still retain the hook's same-tab guard and receipt.
    return Promise.resolve({ kind: "acquired", release: () => {} })
  }
  return new Promise(resolve => {
    const unavailable = () => resolve({ kind: "unavailable" })
    try {
      void manager.request(SUBMISSION_LOCK, { mode: "exclusive", ifAvailable: true }, lock => {
        if (!lock) { resolve({ kind: "busy" }); return }
        return new Promise<void>(release => resolve({ kind: "acquired", release }))
      }).catch(unavailable)
    } catch { unavailable() }
  })
}
