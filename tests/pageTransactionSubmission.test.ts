import { describe, expect, it, vi } from "vitest"
import { signAndConfirmOnce } from "../src/app/tx/signAndConfirmOnce"
import { TxConfirmationUnknownError } from "../src/app/tx/broadcastOutcome"
import { formatTxError } from "../src/app/utils/txError"

const hash = "AB".repeat(32)
const setup = () => {
  // Empty, non-signature fixture bytes; no wallet, network or RPC connection.
  const client = {
    getSequence: vi.fn(async () => ({ accountNumber: 1, sequence: 5 })),
    sign: vi.fn(async () => ({ bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] })),
    broadcastTx: vi.fn(async () => ({ code: 0, transactionHash: hash }))
  }
  const onPhase = vi.fn()
  const submit = () => signAndConfirmOnce({
    client, signerAddress: "fixture", messages: [], fee: { amount: [], gas: "1" },
    memo: "", chainId: "columbus-5", onPhase
  })
  return { client, onPhase, submit }
}

describe("one approval per Swap, bonding curve or governance submission", () => {
  it("does not report confirmation while the mock user has not signed", async () => {
    const { client, onPhase, submit } = setup()
    client.sign.mockRejectedValueOnce(new Error("User rejected"))
    await expect(submit()).rejects.toThrow("User rejected")
    expect(onPhase.mock.calls).toEqual([["signing"]])
    expect(client.broadcastTx).not.toHaveBeenCalled()
  })

  it("does not fetch a second sequence, sign again, or submit again", async () => {
    const { client, submit } = setup()
    client.broadcastTx.mockRejectedValueOnce(new Error("account sequence mismatch, expected 6, got 5"))
    await expect(submit()).rejects.toThrow("account sequence mismatch")
    expect(client.getSequence).toHaveBeenCalledTimes(1)
    expect(client.sign).toHaveBeenCalledTimes(1)
    expect(client.broadcastTx).toHaveBeenCalledTimes(1)
  })

  it("retains the original uncertain receipt and safe message instead of claiming success", async () => {
    const { client, onPhase, submit } = setup()
    const unknown = new TxConfirmationUnknownError(hash, "columbus-5")
    client.broadcastTx.mockRejectedValueOnce(unknown)
    await expect(submit()).rejects.toBe(unknown)
    expect(formatTxError(unknown, "Swap failed")).toBe(unknown.message)
    expect(onPhase.mock.calls).toEqual([["signing"], ["confirming"]])
    expect(client.broadcastTx).toHaveBeenCalledTimes(1)
  })

  it("returns the hash only from a confirmed, successful execution", async () => {
    const { client, submit } = setup()
    client.broadcastTx.mockResolvedValueOnce({ code: 5, transactionHash: hash })
    await expect(submit()).rejects.toThrow("Transaction failed with code 5")
    await expect(submit()).resolves.toBe(hash)
  })
})
