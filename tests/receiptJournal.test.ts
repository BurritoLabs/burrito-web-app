import { afterEach, describe, expect, it, vi } from "vitest"
import { lookupReceipt, normalizeTxHash } from "../src/app/tx/receiptJournal"

const hash = "AB".repeat(32)
const pointer = { chainKey: "lunc" as const, hash, startedAt: 1 }
const reply = (tx: unknown) => Response.json({ tx_response: tx })
afterEach(() => vi.unstubAllGlobals())
describe("receipt lookup is read-only and requires evidence of inclusion", () => {
  it.each([0, 11])("recognizes the explicit execution code %i and includes no credentials", async code => {
    const read = vi.fn().mockResolvedValue(reply({ txhash: hash.toLowerCase(), height: "200", code }))
    vi.stubGlobal("fetch", read)
    expect(await lookupReceipt(pointer)).toEqual({code})
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(expect.stringContaining("/txs/" + hash), expect.objectContaining({method:"GET", credentials:"omit"}))
  })
  it.each([{txhash: hash, code:0, height:"0"}, {txhash: hash, height:"2"}, {txhash:"CC".repeat(32), height:2, code:0}])("never treats malformed or unmatched receipts as success", async response => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(reply(response))))
    expect(await lookupReceipt(pointer)).toBeUndefined()
  })
  it("uses a different read endpoint on an unavailable index; no second submission", async () => {
    const read = vi.fn().mockResolvedValueOnce(new Response("", {status:404})).mockResolvedValueOnce(reply({ txhash: hash, height:"20", code:0 }))
    vi.stubGlobal("fetch", read)
    expect(await lookupReceipt(pointer)).toEqual({code:0})
    expect(read.mock.calls.map(c => c[1].method)).toEqual(["GET", "GET"])
  })
  it("never makes a request for a missing or invalid hash", async () => {
    const read = vi.fn(); vi.stubGlobal("fetch", read)
    expect(normalizeTxHash("not a hash")).toBeUndefined()
    expect(await lookupReceipt({ ...pointer, hash: undefined })).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
  })
})
