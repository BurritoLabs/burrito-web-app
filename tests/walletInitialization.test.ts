import { describe, expect, it } from "vitest"
import { isWalletInitializationError } from "../src/app/wallet/walletInitialization"

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
  })

  it("ignores unrelated transaction errors", () => {
    expect(isWalletInitializationError(new Error("Bad status on response: 429"))).toBe(
      false
    )
    expect(isWalletInitializationError(new Error("insufficient funds"))).toBe(false)
  })
})
