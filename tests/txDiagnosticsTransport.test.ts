import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TxErrorCategory } from "../src/app/tx/txDiagnostics"

const endpoint = "https://diagnostics.example.test/transactions"
const storageKey = "burrito:tx-diagnostics:v1"
const address = `terra1${"q".repeat(38)}`
const txHash = "A".repeat(64)
const originalMessage = `Failed for ${address} ${txHash} ${"x".repeat(220)} https://example.test/request?token=private-test-value#private-fragment`

describe("transaction diagnostic transport", () => {
  let values: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>
  let beacon: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_TX_DIAGNOSTICS_ENDPOINT", endpoint)
    values = new Map<string, string>()
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("navigator", { sendBeacon: beacon })
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      },
      location: {
        pathname: "/commission",
        search: "?token=private-location-value",
        hash: "#private-location-fragment"
      },
      navigator: { onLine: true, userAgent: "Transaction diagnostics QA" }
    })
    vi.stubGlobal("document", { visibilityState: "visible" })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("sends only the remote field allowlist through credential-free fetch, never Beacon", async () => {
    const { recordTxDiagnostic } = await import("../src/app/tx/txDiagnostics")
    recordTxDiagnostic({
      phase: "failure", label: "Withdraw commission", connectorId: "burrito",
      accountAddress: address, txHash, category: "unknown",
      message: originalMessage, rawMessage: originalMessage,
      gasUsed: "100", gasWanted: "200", durationMs: 1_234
    })

    expect(beacon).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(endpoint, {
      method: "POST",
      body: expect.any(String),
      headers: { "content-type": "text/plain;charset=UTF-8" },
      credentials: "omit",
      keepalive: true
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      version: 1, release: "test", chainKey: "lunc", chainId: "columbus-5",
      path: "/commission", online: true, visibilityState: "visible",
      phase: "failure", label: "Withdraw commission", connectorId: "burrito",
      category: "unknown", message: "Transaction failed.",
      gasUsed: "100", gasWanted: "200", durationMs: 1_234,
      at: expect.any(String)
    })
    const body = fetchMock.mock.calls[0][1].body as string
    for (const excluded of [address, txHash, "private-test-value", "private-fragment", "private-location-value", "private-location-fragment", "accountAddress", "rawMessage"]) {
      expect(body).not.toContain(excluded)
    }
  })

  it.each([
    ["wallet_rejected", "Transaction cancelled in wallet."],
    ["sequence_mismatch", "Wallet signature is out of sync."],
    ["already_submitted", "Transaction was already submitted."],
    ["insufficient_funds", "Insufficient balance for the transaction."],
    ["slippage", "Transaction exceeded the slippage limit."],
    ["gas_too_low", "Transaction gas was insufficient."],
    ["network", "Transaction encountered a network error."],
    ["unauthorized", "Wallet is not authorized for this action."],
    ["invalid_symbol", "Token symbol did not pass validation."],
    ["validation", "Transaction did not pass validation."],
    ["unknown", "Transaction failed."]
  ] as const)("uses a fixed %s summary and preserves original error text only locally", async (category: TxErrorCategory, summary: string) => {
    const { recordTxDiagnostic, getStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")
    recordTxDiagnostic({ phase: "failure", category, message: originalMessage, rawMessage: originalMessage })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toBe(summary)
    expect(getStoredTxDiagnostics()[0]).toMatchObject({ category, message: originalMessage, rawMessage: originalMessage })
  })

  it("uses a fixed fallback when a failure has no category", async () => {
    const { recordTxDiagnostic } = await import("../src/app/tx/txDiagnostics")
    recordTxDiagnostic({ phase: "failure", message: originalMessage })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ message: "Transaction failed." })
  })

  it.each(["start", "success"] as const)("does not transmit arbitrary message text for %s events", async (phase) => {
    const { recordTxDiagnostic } = await import("../src/app/tx/txDiagnostics")
    recordTxDiagnostic({ phase, message: originalMessage })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("message")
  })

  it.each(["", "   "])("does not send when the endpoint is disabled (%j), and keeps local diagnostics", async (configuredEndpoint) => {
    vi.stubEnv("VITE_TX_DIAGNOSTICS_ENDPOINT", configuredEndpoint)
    const { recordTxDiagnostic, getStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")
    recordTxDiagnostic({ phase: "failure", message: originalMessage, accountAddress: address })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(getStoredTxDiagnostics()[0]).toMatchObject({ message: originalMessage, accountAddress: address })
  })

  it("retains the latest 50 full local records and copies eight without sending the copied report", async () => {
    vi.stubEnv("VITE_TX_DIAGNOSTICS_ENDPOINT", "")
    const { recordTxDiagnostic, getStoredTxDiagnostics, buildTxDiagnosticsReport } = await import("../src/app/tx/txDiagnostics")
    for (let index = 0; index < 55; index++) {
      recordTxDiagnostic({
        phase: "failure", label: `Local record ${index}`,
        accountAddress: address, txHash, message: originalMessage, rawMessage: originalMessage
      })
    }
    expect(JSON.parse(values.get(storageKey) ?? "[]")).toHaveLength(50)
    const stored = getStoredTxDiagnostics()
    expect(stored[0]).toMatchObject({ label: "Local record 54", accountAddress: address, txHash, rawMessage: originalMessage })
    expect(stored[49].label).toBe("Local record 5")
    const copied = JSON.parse(buildTxDiagnosticsReport())
    expect(copied.events).toEqual(stored.slice(0, 8))
    expect(copied.context).toMatchObject({ path: "/commission", userAgent: "Transaction diagnostics QA" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })

  it.each(["synchronous", "asynchronous"])("keeps the local record after %s transport failure", async (mode) => {
    if (mode === "synchronous") fetchMock.mockImplementation(() => { throw new Error("Synthetic offline") })
    else fetchMock.mockRejectedValue(new Error("Synthetic offline"))
    const { recordTxDiagnostic, getStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")
    expect(() => recordTxDiagnostic({ phase: "failure", message: originalMessage })).not.toThrow()
    await Promise.resolve()
    expect(getStoredTxDiagnostics()[0].message).toBe(originalMessage)
    expect(beacon).not.toHaveBeenCalled()
  })
})
