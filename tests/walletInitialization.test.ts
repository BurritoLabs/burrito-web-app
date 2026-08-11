import { describe, expect, it } from "vitest"
import {
  isWalletInitializationError,
  runWithWalletInitializationRetry
} from "../src/app/wallet/walletInitialization"

describe("wallet initialization errors", () => {
  it("detects stale mobile WalletConnect and Keplr client errors", () => {
    expect(
      isWalletInitializationError(
        new Error("Keplr Wallet is not initialized")
      )
    ).toBe(true)
    expect(
      isWalletInitializationError(
        new Error("WalletConnect is not initialized")
      )
    ).toBe(true)
    expect(
      isWalletInitializationError(
        new Error("WalletClient is not initialized")
      )
    ).toBe(true)
    expect(isWalletInitializationError("wallet not initialized")).toBe(true)
    expect(isWalletInitializationError("wallet not sync")).toBe(true)
  })

  it("ignores unrelated transaction errors", () => {
    expect(isWalletInitializationError(new Error("Bad status on response: 429"))).toBe(
      false
    )
    expect(isWalletInitializationError(new Error("insufficient funds"))).toBe(false)
  })

  it("recovers once and retries a stale mobile wallet operation", async () => {
    let attempts = 0
    let recoveries = 0
    const result = await runWithWalletInitializationRetry(
      async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error("Keplr Wallet is not initialized")
        }
        return "signed"
      },
      async () => {
        recoveries += 1
      }
    )

    expect(result).toBe("signed")
    expect(attempts).toBe(2)
    expect(recoveries).toBe(1)
  })

  it("does not retry unrelated transaction failures", async () => {
    let recoveries = 0

    await expect(
      runWithWalletInitializationRetry(
        async () => {
          throw new Error("insufficient funds")
        },
        async () => {
          recoveries += 1
        }
      )
    ).rejects.toThrow("insufficient funds")
    expect(recoveries).toBe(0)
  })
})
