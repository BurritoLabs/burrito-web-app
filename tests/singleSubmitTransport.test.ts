import type { OfflineSigner } from "@cosmjs/proto-signing"
import { BroadcastTxError, SigningStargateClient, TimeoutError } from "@cosmjs/stargate"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setActiveAppChainKey } from "../src/app/activeChain"
import { TxConfirmationUnknownError } from "../src/app/tx/broadcastOutcome"
import { observeSignedTx } from "../src/app/tx/receiptJournal"
import { getClassicTxHash } from "../src/app/wallet/signingClient"
import { publishSigningSelection } from "../src/app/wallet/signingSelection"
import {
  connectSigningClientForConnector, connectStargateClientForConnector, registerWalletAdapterRuntime
} from "../src/app/wallet/walletAdapters"

// No wallet, network, private keys, or real signing. Exercise the production
// wrappers with a fake RPC and a fixed byte fixture (not a usable Cosmos tx).
const account = "fixture-account"
const chainId = "columbus-5"
const fee = { gas: "1234", amount: [{ amount: "3", denom: "uluna" }] }
const raw = TxRaw.fromPartial({ bodyBytes: Uint8Array.of(1, 2, 3) })
const bytes = TxRaw.encode(raw).finish()
const hash = getClassicTxHash(bytes)
function setup() {
  setActiveAppChainKey("lunc")
  const signer = { getAccounts: vi.fn(async () => [{ address: account }]) } as unknown as OfflineSigner
  const rpc = {
    getChainId: vi.fn(async () => chainId),
    simulate: vi.fn(async () => 1000),
    getSequence: vi.fn(async () => ({ accountNumber: 7, sequence: 9 })),
    sign: vi.fn(async () => raw),
    broadcastTx: vi.fn(async () => ({ code: 0, transactionHash: hash, rawLog: "" })),
    broadcastTxSync: vi.fn(async () => hash)
  }
  const connect = vi.spyOn(SigningStargateClient, "connectWithSigner")
    .mockResolvedValue(rpc as unknown as SigningStargateClient)
  registerWalletAdapterRuntime({ getOfflineSigner: async () => signer })
  return { rpc, connect, signer }
}

afterEach(() => { registerWalletAdapterRuntime(undefined); vi.restoreAllMocks() })
describe.each([
  ["swap", connectSigningClientForConnector],
  ["governance/send", connectStargateClientForConnector]
] as const)("%s mobile signing transport", (_label, factory) => {
  it.each(["auto", fee] as const)("single dispatch for fee %j, including after lost reply", async f => {
    const { rpc, connect } = setup()
    const events: string[] = []
    const stop = observeSignedTx((observed, chain) => events.push(chain + ":" + observed))
    try {
      rpc.broadcastTx.mockImplementationOnce(async () => {
        expect(events).toEqual([chainId + ":" + hash])
        throw new TypeError("Load failed")
      })
      const client = await factory("keplr-mobile")
      await expect(client.signAndBroadcast(account, [], f)).rejects.toMatchObject({
        name: "TxConfirmationUnknownError", txHash: hash, chainId
      })
      expect(rpc.simulate).toHaveBeenCalledTimes(f === "auto" ? 1 : 0)
      expect(rpc.getSequence).toHaveBeenCalledTimes(1)
      expect(rpc.sign).toHaveBeenCalledTimes(1)
      expect(rpc.broadcastTx).toHaveBeenCalledTimes(1)
      expect(connect).toHaveBeenCalledTimes(1)
    } finally { stop() }
  })

  it("never signs again after an explicit CheckTx sequence rejection", async () => {
    const { rpc } = setup()
    const rejected = new BroadcastTxError(32, "sdk", "account sequence mismatch, expected 10, got 9")
    rpc.broadcastTx.mockRejectedValueOnce(rejected)
    const client = await factory("keplr-mobile")
    await expect(client.signAndBroadcast(account, [], fee)).rejects.toBe(rejected)
    expect(rpc.sign).toHaveBeenCalledTimes(1)
    expect(rpc.broadcastTx).toHaveBeenCalledTimes(1)
  })

  it("does not open a signing prompt for an account different from the one reviewed", async () => {
    const { rpc } = setup()
    const client = await factory("keplr-mobile")
    await expect(client.signAndBroadcast("earlier-account", [], fee)).rejects.toThrow("account changed")
    expect(rpc.sign).not.toHaveBeenCalled()
    expect(rpc.broadcastTx).not.toHaveBeenCalled()
  })

  it("a confirmed nonzero result is a failure; declining the wallet sends nothing", async () => {
    const { rpc } = setup()
    rpc.broadcastTx.mockResolvedValueOnce({ code: 4, rawLog: "execution rejected", transactionHash: hash })
    const client = await factory("keplr-mobile")
    await expect(client.signAndBroadcast(account, [], "auto")).rejects.toThrow("execution rejected")
    const cancelled = new Error("User rejected")
    rpc.sign.mockRejectedValueOnce(cancelled)
    await expect(client.signAndBroadcast(account, [], fee)).rejects.toBe(cancelled)
    expect(rpc.broadcastTx).toHaveBeenCalledTimes(1)
  })
})

it("raw broadcast and sync keep original hash on inclusion timeout, cache, or mismatched receipt", async () => {
  const { rpc, connect } = setup()
  const client = await connectStargateClientForConnector("keplr-mobile")
  rpc.broadcastTx.mockRejectedValueOnce(new TimeoutError("submitted but not yet found", hash))
  await expect(client.broadcastTx(bytes)).rejects.toMatchObject({ name: "TxConfirmationUnknownError", txHash: hash })
  rpc.broadcastTxSync.mockRejectedValueOnce(new Error("tx already exists in cache"))
  await expect(client.broadcastTxSync(bytes)).rejects.toBeInstanceOf(TxConfirmationUnknownError)
  rpc.broadcastTx.mockResolvedValueOnce({ code: 0, rawLog: "", transactionHash: "B".repeat(64) })
  await expect(client.broadcastTx(bytes)).rejects.toMatchObject({ txHash: hash })
  expect(connect).toHaveBeenCalledTimes(1)
  expect(rpc.broadcastTx).toHaveBeenCalledTimes(2)
  expect(rpc.broadcastTxSync).toHaveBeenCalledTimes(1)
})

it("auto simulation can fail over before approval, without a second prompt or write", async () => {
  const { rpc, connect } = setup()
  rpc.simulate.mockRejectedValueOnce(new Error("503"))
  const client = await connectStargateClientForConnector("keplr-mobile", "uusd")
  await expect(client.signAndBroadcast(account, [], "auto")).resolves.toMatchObject({ transactionHash: hash })
  expect(connect).toHaveBeenCalledTimes(2)
  expect(rpc.sign).toHaveBeenCalledExactlyOnceWith(account, [], {
    gas: "1400", amount: [{ denom: "uusd", amount: expect.stringMatching(/^\d+$/) }]
  }, "", { chainId, accountNumber: 7, sequence: 9 })
  expect(rpc.broadcastTx).toHaveBeenCalledTimes(1)
})

it.each(["mobile signer", "mobile selection", "chain", "injected signer"] as const)(
  "drops late signed bytes after a %s change", async mode => {
    let selected = true
    const { rpc, signer } = setup()
    const stop = publishSigningSelection({ token: {}, matches: () => selected })
    const stopEvents = vi.fn()
    const unsubscribe = observeSignedTx(stopEvents)
    const id = mode === "injected signer" ? "keplr" : "keplr-mobile"
    if (id === "keplr") vi.stubGlobal("window", {
      keplr: { version: "1.0", enable: async () => {}, getKey: async () => ({ bech32Address: account }),
        getOfflineSignerAuto: async () => signer }
    })
    try {
      const client = await connectStargateClientForConnector(id)
      rpc.sign.mockImplementationOnce(async () => {
        if (mode === "mobile selection") selected = false
        else if (mode === "chain") { setActiveAppChainKey("luna"); setActiveAppChainKey("lunc") }
        else vi.mocked(signer.getAccounts).mockResolvedValue([])
        return raw
      })
      await expect(client.signAndBroadcast(account, [], fee)).rejects.not.toBeInstanceOf(TxConfirmationUnknownError)
      expect(rpc.sign).toHaveBeenCalledTimes(1)
      expect(rpc.broadcastTx).not.toHaveBeenCalled()
      expect(stopEvents).not.toHaveBeenCalled()
    } finally {
      unsubscribe(); stop(); vi.unstubAllGlobals(); setActiveAppChainKey("lunc")
    }
  }
)

it("rechecks the selected owner even across separate sign and broadcast calls", async () => {
  const { rpc } = setup()
  let connected = true
  const stop = publishSigningSelection({ token: {}, matches: () => connected })
  try {
    const client = await connectStargateClientForConnector("keplr-mobile")
    const signed = await client.sign(account, [], fee, "", { accountNumber: 7, sequence: 9, chainId })
    connected = false
    await expect(client.broadcastTx(TxRaw.encode(signed).finish())).rejects.toThrow("No transaction was sent")
    expect(rpc.broadcastTx).not.toHaveBeenCalled()
  } finally { stop() }
})

it("rejects pre-built signing data for a different chain before prompting", async () => {
  const { rpc } = setup()
  const client = await connectStargateClientForConnector("keplr-mobile")
  await expect(async () => client.sign(account, [], fee, "", {
    accountNumber: 7, sequence: 9, chainId: "phoenix-1"
  })).rejects.toThrow("different chain")
  expect(rpc.sign).not.toHaveBeenCalled()
  expect(rpc.broadcastTx).not.toHaveBeenCalled()
})
