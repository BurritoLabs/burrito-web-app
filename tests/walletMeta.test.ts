import { afterEach, describe, expect, it, vi } from "vitest"
import {
  WALLET_CONNECTOR_STORAGE_KEY,
  forgetStoredWalletSession,
  rememberWalletConnectorId
} from "../src/app/wallet/walletMeta"

const createLocalStorage = () => {
  const values = new Map<string, string>()

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }
}

describe("wallet storage metadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("clears Burrito and Cosmos Kit wallet session keys", () => {
    const localStorage = createLocalStorage()
    vi.stubGlobal("window", { localStorage })

    rememberWalletConnectorId("keplr-mobile")
    localStorage.setItem("cosmos-kit@2:core//current-wallet", "keplr-mobile")
    localStorage.setItem("cosmos-kit@2:core//accounts", "[]")
    localStorage.setItem("unrelated", "keep")

    forgetStoredWalletSession()

    expect(localStorage.getItem(WALLET_CONNECTOR_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem("cosmos-kit@2:core//current-wallet")).toBeNull()
    expect(localStorage.getItem("cosmos-kit@2:core//accounts")).toBeNull()
    expect(localStorage.getItem("unrelated")).toBe("keep")
  })
})
