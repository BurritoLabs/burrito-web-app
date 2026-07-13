import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildTxDiagnosticsReport,
  cleanTxErrorMessage,
  classifyTxError,
  isTxAlreadyInCacheError,
  parseSequenceMismatchExpected,
  recordTxDiagnostic
} from "../src/app/tx/txDiagnostics"

const createMemoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  }
}

describe("transaction diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("extracts expected account sequence values", () => {
    expect(
      parseSequenceMismatchExpected(
        "signature verification failed; account sequence mismatch, expected 42, got 41"
      )
    ).toBe(42)

    expect(
      parseSequenceMismatchExpected(
        "account sequence mismatch, expected: 43, actual: 42"
      )
    ).toBe(43)
  })

  it("ignores messages without an expected sequence", () => {
    expect(parseSequenceMismatchExpected("insufficient funds")).toBeUndefined()
  })

  it("classifies sequence mismatch errors with a wallet sync message", () => {
    const result = classifyTxError(
      "rpc error: account sequence mismatch, expected 8, got 7",
      "Submit failed"
    )

    expect(result.category).toBe("sequence_mismatch")
    expect(result.userMessage).toContain("Wallet signature is out of sync")
  })

  it("classifies mobile wallet sync errors with a wallet sync message", () => {
    const result = classifyTxError("wallet not sync", "Submit failed")

    expect(result.category).toBe("sequence_mismatch")
    expect(result.userMessage).toContain("Wallet signature is out of sync")
  })

  it("removes noisy chain prefixes from transaction errors", () => {
    expect(
      cleanTxErrorMessage(
        "Query failed with (6): rpc error: code = Unknown desc = max spread assertion with gas used: '12345'"
      )
    ).toBe("max spread assertion")
  })

  it("classifies endpoint rate limits as network errors", () => {
    const result = classifyTxError(
      new Error("Bad status on response: 429"),
      "Broadcast failed"
    )

    expect(result.category).toBe("network")
    expect(result.userMessage).toContain("rate limited")
  })

  it("recognizes already submitted broadcast cache errors", () => {
    expect(
      isTxAlreadyInCacheError(
        '{"code":-32603,"message":"Internal error","data":"tx already exists in cache"}'
      )
    ).toBe(true)

    const result = classifyTxError(
      new Error("Internal error: tx already exists in cache"),
      "Broadcast failed"
    )

    expect(result.category).toBe("already_submitted")
    expect(result.userMessage).toContain("already submitted")
  })

  it("includes release, chain, connection state, and duration in copied diagnostics", () => {
    vi.stubGlobal("window", {
      localStorage: createMemoryStorage(),
      location: { pathname: "/commission" },
      navigator: { onLine: true, userAgent: "Burrito test" }
    })
    vi.stubGlobal("document", { visibilityState: "visible" })

    recordTxDiagnostic({
      phase: "failure",
      label: "Withdraw commission",
      durationMs: 1_234,
      message: "Test failure"
    })

    const report = JSON.parse(buildTxDiagnosticsReport()) as {
      context: Record<string, unknown>
      events: Array<Record<string, unknown>>
    }

    expect(report.context).toMatchObject({
      chainKey: "lunc",
      chainId: "columbus-5",
      online: true,
      path: "/commission",
      visibilityState: "visible"
    })
    expect(report.context.release).toBeTruthy()
    expect(report.events[0]).toMatchObject({
      durationMs: 1_234,
      label: "Withdraw commission",
      phase: "failure"
    })
  })
})
