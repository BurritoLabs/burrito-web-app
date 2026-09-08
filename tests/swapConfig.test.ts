import { describe, expect, it } from "vitest"
import {
  FALLBACK_GAS_CW20_FEE,
  FALLBACK_GAS_CW20_SWAP,
  SWAP_FALLBACK_GAS_ADJUSTMENT,
  SWAP_GAS_ADJUSTMENT,
  SWAP_MEMO
} from "../src/app/config/swapConfig"

describe("swap transaction settings", () => {
  it("uses an ASCII memo that wallets cannot double-escape", () => {
    expect(SWAP_MEMO).toBe("Swapped via Burrito Swap")
    expect(SWAP_MEMO).not.toContain("\\u")
  })

  it("keeps enough gas headroom for multi-message fee distributions", () => {
    expect(SWAP_GAS_ADJUSTMENT).toBeGreaterThanOrEqual(1.6)
    expect(SWAP_FALLBACK_GAS_ADJUSTMENT).toBeGreaterThanOrEqual(1.25)
  })

  it("does not fall back to the known-underfunded 525k CW20 fee route", () => {
    const fallbackGas = Math.ceil(
      (FALLBACK_GAS_CW20_SWAP + FALLBACK_GAS_CW20_FEE) *
        SWAP_FALLBACK_GAS_ADJUSTMENT
    )

    expect(fallbackGas).toBeGreaterThanOrEqual(1_000_000)
    expect(fallbackGas).not.toBe(525_000)
  })
})
