type WalletRecoveryRetryInput = {
  visible: boolean
  attempted: boolean
  pending: boolean
  status: "disconnected" | "connecting" | "connected" | "error"
  now: number
  lastAttemptAt: number
  cooldownMs: number
}

export const canRetryWalletRecovery = ({
  visible,
  attempted,
  pending,
  status,
  now,
  lastAttemptAt,
  cooldownMs
}: WalletRecoveryRetryInput) =>
  visible &&
  // Initial focus/pageshow must not spend a failed restore's retry window.
  attempted &&
  !pending &&
  status !== "connecting" &&
  status !== "connected" &&
  now - lastAttemptAt >= cooldownMs
