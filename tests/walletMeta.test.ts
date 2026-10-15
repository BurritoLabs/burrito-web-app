import { afterEach, describe, expect, it, vi } from "vitest"
import {
  WALLET_MANUAL_DISCONNECT_STORAGE_KEY,
  WALLET_CONNECTOR_STORAGE_KEY,
  forgetStoredWalletSession,
  getStoredWalletConnectorId,
  isWalletManualDisconnectStored,
  rememberWalletManualDisconnect,
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

  it("keeps refresh auto-connect disabled after a manual disconnect", () => {
    const localStorage = createLocalStorage()
    vi.stubGlobal("window", { localStorage })

    rememberWalletConnectorId("keplr")
    rememberWalletManualDisconnect()
    forgetStoredWalletSession()

    expect(isWalletManualDisconnectStored()).toBe(true)
    expect(getStoredWalletConnectorId()).toBeUndefined()
    expect(localStorage.getItem(WALLET_MANUAL_DISCONNECT_STORAGE_KEY)).toBe("true")

    rememberWalletConnectorId("keplr")

    expect(isWalletManualDisconnectStored()).toBe(false)
    expect(getStoredWalletConnectorId()).toBe("keplr")
  })

  it("persists the Burrito native connector without storing wallet secrets", () => {
    const localStorage = createLocalStorage()
    vi.stubGlobal("window", { localStorage })

    rememberWalletConnectorId("burrito-native")

    expect(getStoredWalletConnectorId()).toBe("burrito-native")
    expect(localStorage.getItem(WALLET_CONNECTOR_STORAGE_KEY)).toBe(
      "burrito-native"
    )
    expect(localStorage.getItem("mnemonic")).toBeNull()
  })

  it("persists the Burrito extension connector without storing wallet secrets", () => {
    const localStorage = createLocalStorage()
    vi.stubGlobal("window", { localStorage })

    rememberWalletConnectorId("burrito-extension")

    expect(getStoredWalletConnectorId()).toBe("burrito-extension")
    expect(localStorage.getItem(WALLET_CONNECTOR_STORAGE_KEY)).toBe(
      "burrito-extension"
    )
    expect(localStorage.getItem("mnemonic")).toBeNull()
  })
})
