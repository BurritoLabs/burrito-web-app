export const STALE_ASSET_RECOVERY_DELAYS_MS = [
  2_000,
  5_000,
  10_000,
  20_000
]

export const getStaleAssetRecoveryDelay = (attempts: number) =>
  STALE_ASSET_RECOVERY_DELAYS_MS[
    Math.min(Math.max(0, attempts), STALE_ASSET_RECOVERY_DELAYS_MS.length - 1)
  ]
