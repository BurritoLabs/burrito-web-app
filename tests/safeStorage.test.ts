import { afterEach, describe, expect, it, vi } from "vitest"
import {
  readLocalStorageValue,
  writeLocalStorageValue
} from "../src/app/utils/safeStorage"
import { sanitizeHiddenTokens } from "../src/app/wallet/useWalletVisibilityPreferences"

const createQuotaStorage = () => {
  const values = new Map<string, string>([
    ["cw20balance-single:v1:wallet:columbus-5:token", "cached"],
    ["burritoIbcTraceCacheV4", "cached"],
    ["burritoWalletConnector", "keplr"]
  ])
  return {
    get length() {
      return values.size
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => {
      if ([...values.keys()].some((item) => item.startsWith("cw20balance-"))) {
        throw new DOMException("Quota exceeded", "QuotaExceededError")
      }
      values.set(key, value)
    }
  }
}

describe("safe browser storage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("evicts disposable asset caches and retries a preference write", () => {
    const localStorage = createQuotaStorage()
    vi.stubGlobal("window", { localStorage })

    expect(writeLocalStorageValue("burritoHiddenTokens:columbus-5", "[]")).toBe(true)
    expect(readLocalStorageValue("burritoHiddenTokens:columbus-5")).toBe("[]")
    expect(readLocalStorageValue("burritoWalletConnector")).toBe("keplr")
    expect(
      readLocalStorageValue("cw20balance-single:v1:wallet:columbus-5:token")
    ).toBeNull()
    expect(readLocalStorageValue("burritoIbcTraceCacheV4")).toBeNull()
  })

  it("deduplicates and bounds legacy hidden-token lists", () => {
    const hidden = sanitizeHiddenTokens([
      " uluna ",
      "terra1token",
      "terra1token",
      "x".repeat(257),
      ...Array.from({ length: 1_100 }, (_, index) => `token-${index}`)
    ])

    expect(hidden).toHaveLength(1_000)
    expect(hidden[0]).toBe("terra1token")
    expect(hidden).not.toContain("uluna")
  })
})
