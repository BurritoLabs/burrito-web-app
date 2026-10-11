import { describe, expect, it } from "vitest"
import { canRetryWalletRecovery } from "../src/app/wallet/walletRecoveryRetry"

const state = {
  visible: true,
  pending: false,
  status: "error" as const,
  now: 30_000,
  lastAttemptAt: 15_000,
  cooldownMs: 15_000
}

describe("wallet recovery retry gate", () => {
  it("does not retry while the document is hidden", () => {
    expect(canRetryWalletRecovery({ ...state, visible: false })).toBe(false)
  })

  it("does not duplicate a pending or connecting recovery", () => {
    expect(canRetryWalletRecovery({ ...state, pending: true })).toBe(false)
    expect(canRetryWalletRecovery({ ...state, status: "connecting" })).toBe(false)
  })

  it("allows one foreground retry after the cooldown and blocks the cooldown window", () => {
    expect(canRetryWalletRecovery({ ...state, now: 29_999 })).toBe(false)
    expect(canRetryWalletRecovery(state)).toBe(true)
  })

  it("does not retry an already connected wallet", () => {
    expect(canRetryWalletRecovery({ ...state, status: "connected" })).toBe(false)
  })
})
