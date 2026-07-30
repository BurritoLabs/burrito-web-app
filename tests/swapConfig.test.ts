import { describe, expect, it } from "vitest"
import {
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
})
