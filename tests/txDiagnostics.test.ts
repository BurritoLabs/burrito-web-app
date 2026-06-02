import { describe, expect, it } from "vitest"
import {
  cleanTxErrorMessage,
  classifyTxError,
  parseSequenceMismatchExpected
} from "../src/app/tx/txDiagnostics"

describe("transaction diagnostics", () => {
  it("extracts expected account sequence values", () => {
    expect(
      parseSequenceMismatchExpected(
        "signature verification failed; account sequence mismatch, expected 42, got 41"
      )
    ).toBe(42)
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

  it("removes noisy chain prefixes from transaction errors", () => {
    expect(
      cleanTxErrorMessage(
        "Query failed with (6): rpc error: code = Unknown desc = max spread assertion with gas used: '12345'"
      )
    ).toBe("max spread assertion")
  })
})
