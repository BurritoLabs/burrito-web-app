import { afterEach, describe, expect, it, vi } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import {
  connectClassicSigningClientForConnector,
  connectClassicStargateClientForConnector,
  connectWalletConnector,
  getAminoOfflineSignerForConnector,
  getOfflineSignerForConnector,
  getWalletConnectors,
  registerWalletAdapterRuntime
} from "../src/app/wallet/walletAdapters"

vi.mock("../src/app/wallet/signingClient", () => ({
  connectSigningClient: vi.fn(() => { throw new Error("Unexpected client construction") }),
  connectStargateClient: vi.fn(() => { throw new Error("Unexpected client construction") })
}))

// Provider-routing fixtures only: no private keys, signatures or network calls.
const signer = { getAccounts: vi.fn(async () => []) }
const makeProvider = (name: string, version: string) => ({
  version,
  enable: vi.fn(async () => {}),
  getKey: vi.fn(async () => ({ bech32Address: `${name}-public-test-address`, name })),
  getOfflineSignerAuto: vi.fn(async () => signer),
  getOfflineSignerOnlyAmino: vi.fn(() => signer)
})

afterEach(() => {
  registerWalletAdapterRuntime(undefined)
  setActiveAppChainKey("lunc")
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("independent desktop Keplr identity", () => {
  for (const named of [true, false]) {
    it(`does not list Burrito's compatibility alias as Keplr (named=${named})`, () => {
      const alias = makeProvider("Burrito", "burrito-compat-v1")
      vi.stubGlobal("window", { keplr: alias, ...(named ? { BurritoKeplr: alias } : {}) })
      expect(getWalletConnectors().find(({ id }) => id === "keplr")?.available).toBe(false)
    })
  }

  it("also rejects the named compatibility object if its version format changes", () => {
    const alias = makeProvider("Burrito", "future-version")
    vi.stubGlobal("window", { keplr: alias, BurritoKeplr: alias })
    expect(getWalletConnectors().find(({ id }) => id === "keplr")?.available).toBe(false)
  })

  for (const chain of ["lunc", "luna"] as const) {
    it(`rejects alias connect and signer acquisition before calling the runtime on ${chain}`, async () => {
      setActiveAppChainKey(chain)
      const alias = makeProvider("Burrito", "burrito-compat-v1")
      vi.stubGlobal("window", { keplr: alias, BurritoKeplr: alias })
      const runtime = {
        getConnector: vi.fn(() => ({ id: "keplr" as const, label: "Keplr", type: "extension" as const, available: true })),
        connect: vi.fn(async () => ({ address: "stale-runtime-address" })),
        getOfflineSigner: vi.fn(),
        getAminoOfflineSigner: vi.fn(),
        getSigningStargateClient: vi.fn()
      }
      registerWalletAdapterRuntime(runtime)
      expect(getWalletConnectors().find(({ id }) => id === "keplr")?.available).toBe(false)
      await expect(connectWalletConnector("keplr")).rejects.toThrow("Keplr not installed")
      await expect(getOfflineSignerForConnector("keplr")).rejects.toThrow("Keplr not installed")
      await expect(getAminoOfflineSignerForConnector("keplr")).rejects.toThrow("Keplr not installed")
      await expect(connectClassicSigningClientForConnector("keplr")).rejects.toThrow("Keplr not installed")
      await expect(connectClassicStargateClientForConnector("keplr")).rejects.toThrow("Keplr not installed")
      expect(runtime.connect).not.toHaveBeenCalled()
      expect(runtime.getOfflineSigner).not.toHaveBeenCalled()
      expect(runtime.getAminoOfflineSigner).not.toHaveBeenCalled()
      expect(runtime.getSigningStargateClient).not.toHaveBeenCalled()
      expect(alias.enable).not.toHaveBeenCalled()
      expect(alias.getKey).not.toHaveBeenCalled()
      expect(alias.getOfflineSignerAuto).not.toHaveBeenCalled()
      expect(alias.getOfflineSignerOnlyAmino).not.toHaveBeenCalled()
    })

    it(`keeps an independent Keplr separate from the Burrito alias on ${chain}`, async () => {
      setActiveAppChainKey(chain)
      const alias = makeProvider("Burrito", "burrito-compat-v1")
      const keplr = makeProvider("Keplr", "0.13.test")
      vi.stubGlobal("window", { keplr, BurritoKeplr: alias })
      expect(getWalletConnectors().find(({ id }) => id === "keplr")?.available).toBe(true)
      await expect(connectWalletConnector("keplr")).resolves.toMatchObject({ name: "Keplr" })
      await expect(getOfflineSignerForConnector("keplr")).resolves.toBe(signer)
      await expect(getAminoOfflineSignerForConnector("keplr")).resolves.toBe(signer)
      expect(keplr.getKey).toHaveBeenCalledWith(chain === "lunc" ? "columbus-5" : "phoenix-1")
      expect(alias.enable).not.toHaveBeenCalled()
      expect(alias.getOfflineSignerAuto).not.toHaveBeenCalled()
      expect(alias.getOfflineSignerOnlyAmino).not.toHaveBeenCalled()
    })
  }

  it("rejects missing desktop Keplr even if a stale runtime account exists", async () => {
    vi.stubGlobal("window", {})
    const connect = vi.fn(async () => ({ address: "stale-runtime-address" }))
    registerWalletAdapterRuntime({ connect })
    await expect(connectWalletConnector("keplr")).rejects.toThrow("Keplr not installed")
    expect(connect).not.toHaveBeenCalled()
  })

  it("preserves independent legacy global signer helpers", async () => {
    const getOfflineSigner = vi.fn(() => signer)
    vi.stubGlobal("window", { keplr: { enable: async () => {} }, getOfflineSigner })
    await expect(getOfflineSignerForConnector("keplr")).resolves.toBe(signer)
    await expect(getAminoOfflineSignerForConnector("keplr")).resolves.toBe(signer)
    expect(getOfflineSigner).toHaveBeenCalledTimes(2)
  })

  it("never borrows Burrito's global signer helpers for a different Keplr provider", async () => {
    const alias = makeProvider("Burrito", "burrito-compat-v1")
    const aliasSigner = vi.fn(() => signer)
    Object.assign(alias, { getOfflineSigner: aliasSigner })
    const keplr = { enable: vi.fn(async () => {}) }
    vi.stubGlobal("window", {
      keplr, BurritoKeplr: alias,
      getOfflineSigner: aliasSigner,
      getOfflineSignerAuto: alias.getOfflineSignerAuto
    })
    await expect(getOfflineSignerForConnector("keplr")).rejects.toThrow("Keplr signer not available")
    await expect(getAminoOfflineSignerForConnector("keplr")).resolves.toBeUndefined()
    expect(aliasSigner).not.toHaveBeenCalled()
    expect(alias.getOfflineSignerAuto).not.toHaveBeenCalled()
  })
})
