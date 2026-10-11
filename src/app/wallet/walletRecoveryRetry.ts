type WalletRecoveryRetryInput = {
  visible: boolean
  pending: boolean
  status: "disconnected" | "connecting" | "connected" | "error"
  now: number
  lastAttemptAt: number
  cooldownMs: number
}

export const canRetryWalletRecovery = ({
  visible,
  pending,
  status,
  now,
  lastAttemptAt,
  cooldownMs
}: WalletRecoveryRetryInput) =>
  visible &&
  !pending &&
  status !== "connecting" &&
  status !== "connected" &&
  now - lastAttemptAt >= cooldownMs
