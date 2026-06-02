import { describe, expect, it } from "vitest"
import { parseCommonJsArray } from "../src/app/utils/cjsRegistry"

describe("parseCommonJsArray", () => {
  it("parses chain-registry style CommonJS data without executing JavaScript", () => {
    const payload = `
      \uFEFFmodule.exports = [
        {
          token: 'terra1example',
          dex: 'terraswap',
          type: 'xyk',
          assets: ['uluna', 'uusd'],
        },
      ];
    `

    expect(parseCommonJsArray(payload, "test CJS")).toEqual([
      {
        token: "terra1example",
        dex: "terraswap",
        type: "xyk",
        assets: ["uluna", "uusd"]
      }
    ])
  })

  it("rejects executable JavaScript payloads", () => {
    expect(() =>
      parseCommonJsArray("module.exports = (() => [{ token: 'x' }])()", "test CJS")
    ).toThrow(/Unsupported test CJS payload/)
  })

  it("requires an exported array", () => {
    expect(() =>
      parseCommonJsArray("module.exports = { token: 'terra1example' }", "test CJS")
    ).toThrow("Unsupported test CJS payload")
  })
})
