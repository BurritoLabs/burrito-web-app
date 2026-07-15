import { describe, expect, it } from "vitest"
import { sanitizeClientErrorText } from "../src/app/feedback/runtimeErrorReporter"

describe("runtime error reporting", () => {
  it("redacts wallet addresses, validator addresses, hashes, and encoded payloads", () => {
    const address = `terra1${"q".repeat(38)}`
    const validator = `terravaloper1${"q".repeat(38)}`
    const hash = "A".repeat(64)
    const encoded = "x".repeat(220)
    const sanitized = sanitizeClientErrorText(
      `${address} ${validator} ${hash} ${encoded}`,
      2_000
    )

    expect(sanitized).not.toContain(address)
    expect(sanitized).not.toContain(validator)
    expect(sanitized).not.toContain(hash)
    expect(sanitized).not.toContain(encoded)
    expect(sanitized).toContain("<terra_address>")
    expect(sanitized).toContain("<validator_address>")
    expect(sanitized).toContain("<hash>")
    expect(sanitized).toContain("<encoded_value>")
  })

  it("enforces the endpoint field length before transport", () => {
    expect(sanitizeClientErrorText("runtime error! ".repeat(100), 1_000)).toHaveLength(
      1_000
    )
  })
})
