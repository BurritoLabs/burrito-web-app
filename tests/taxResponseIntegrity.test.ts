import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchBurnTaxRate,
  fetchComputedBankSendTax,
  fetchTaxableTransfer,
  fetchTreasuryTaxRate
} from "../src/app/data/classic"

const send = {
  fromAddress: "terra1fixturefrom",
  toAddress: "terra1fixtureto",
  denom: "uluna",
  amount: "1000000"
}
const fetchMock = vi.fn<typeof fetch>()
const respond = (body: unknown) => fetchMock.mockResolvedValue(Response.json(body))

beforeEach(() => {
  // Every actual export uses the ordinary fetch path; no request can escape to
  // a chain endpoint, including compute_tax's read-only simulation POST.
  vi.useFakeTimers()
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error("Unexpected fixture request"))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe.each([
  ["treasury", fetchTreasuryTaxRate, "/terra/treasury/v1beta1/tax_rate"],
  ["burn", fetchBurnTaxRate, "/terra/tax/v1beta1/burn_tax_rate"]
] as const)("%s tax response integrity", (_name, fetchRate, path) => {
  it.each([
    ["0", 0], ["0.000000000000000000", 0],
    ["0.015", 0.015], ["0.015000000000000000", 0.015],
    ["0.025", 0.025], ["1", 1], ["1.000000000000000000", 1]
  ])("retains valid rate %s", async (tax_rate, expected) => {
    respond({ tax_rate })
    await expect(fetchRate()).resolves.toBe(expected)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(path)
  })

  it.each([
    null, [], {}, { tax_rate: null }, { tax_rate: false }, { tax_rate: 0 },
    ...["", " ", " 0.015", "0.015 ", "0.015\n", "NaN", "Infinity", "-Infinity",
      "-0.015", "-0", "+0.015", ".015", "0.", "00.015", "01", "0x0",
      "1e-2", "2", "1.01", "1.0000000000000000001", `0.${"0".repeat(400)}1`
    ].map((tax_rate) => ({ tax_rate }))
  ])("rejects malformed successful payload %j", async (payload) => {
    respond(payload)
    await expect(fetchRate()).rejects.toThrow("Invalid tax rate response")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("taxability response integrity", () => {
  it.each([true, false])("preserves explicit taxability/exemption %s", async (taxable) => {
    respond({ taxable })
    await expect(fetchTaxableTransfer(send.fromAddress, send.toAddress)).resolves.toBe(taxable)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([null, [], {}, ...[null, "true", "false", 0, 1, {}, []].map((taxable) => ({ taxable }))])(
    "does not interpret malformed success %j as exemption", async (payload) => {
      respond(payload)
      await expect(fetchTaxableTransfer(send.fromAddress, send.toAddress))
        .rejects.toThrow("Invalid taxable transfer response")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  )
})

describe("computed bank send tax response integrity", () => {
  it.each([
    [[], "0"],
    [[{ denom: "uluna", amount: "0" }], "0"],
    [[{ denom: "uusd", amount: "42" }], "0"],
    [[{ denom: "uluna", amount: "15000" }], "15000"],
    [[{ denom: "uusd", amount: "42" }, { denom: "uluna", amount: "900719925474099312345" }], "900719925474099312345"]
  ])("preserves sparse zero/exempt lists and exact integer amounts %j", async (tax_amount, expected) => {
    respond({ tax_amount })
    await expect(fetchComputedBankSendTax(send)).resolves.toBe(expected)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(new URL(String(url)).pathname).toBe("/terra/tx/v1beta1/compute_tax")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body)).tx.body.messages[0]).toEqual({
      "@type": "/cosmos.bank.v1beta1.MsgSend",
      from_address: send.fromAddress,
      to_address: send.toAddress,
      amount: [{ denom: send.denom, amount: send.amount }]
    })
  })

  it.each([
    null, [], {}, { tax_amount: null }, { tax_amount: {} }, { tax_amount: "0" },
    ...[null, [], {}, { denom: "uluna" }, { amount: "1" },
      ...["", "0.0", "1.5", "-1", "+1", "01", " 1", "1 ", "1\n", "1e3", "NaN", 0, null]
        .map((amount) => ({ denom: "uluna", amount })),
      ...["", " ucoin", "u coin", "ucoin ", "uluna\n", "1coin", "a", "a".repeat(129), null, 7]
        .map((denom) => ({ denom, amount: "1" }))
    ].map((coin) => ({ tax_amount: [coin] })),
    { tax_amount: [{ denom: "uluna", amount: "1" }, { denom: "uluna", amount: "2" }] },
    { tax_amount: [{ denom: "uusd", amount: "1" }, { denom: "uusd", amount: "2" }] },
    // Validate the entire list, not merely the first matching row.
    { tax_amount: [{ denom: "uluna", amount: "1" }, { denom: "uusd", amount: "bad" }] },
    { tax_amount: [{ denom: "uusd", amount: "bad" }] }
  ])("rejects malformed successful payload %j instead of returning zero", async (payload) => {
    respond(payload)
    await expect(fetchComputedBankSendTax(send)).rejects.toThrow("Invalid computed tax response")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retains HTTP failure semantics", async () => {
    fetchMock.mockResolvedValue(Response.json({ tax_amount: [] }, { status: 400 }))
    await expect(fetchComputedBankSendTax(send)).rejects.toThrow("Request failed: 400")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
