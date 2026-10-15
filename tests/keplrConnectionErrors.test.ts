import { describe, expect, it } from "vitest"
import { getKeplrConnectionErrorMessage } from "../src/app/wallet/keplrConnectionErrors"

describe("Keplr connection error copy", () => {
  it("directs an empty Keplr user to create or import inside the extension", () => {
    expect(getKeplrConnectionErrorMessage(new Error("Users need to create their accounts first")))
      .toBe("No account found in Keplr. Open the Keplr extension to create or import a wallet, then connect again.")
  })

  it.each([
    "Request rejected",
    "User rejected the request",
    "Keplr account unavailable",
    "Keplr not installed",
    "Network request failed",
    "Users need to create their accounts first: unexpected provider failure"
  ])("preserves other provider messages: %s", (message) => {
    expect(getKeplrConnectionErrorMessage(new Error(message))).toBe(message)
  })

  it.each([undefined, null, 4001, "Users need to create their accounts first", {
    message: "Users need to create their accounts first"
  }])("keeps the existing fallback for a non-Error rejection (%j)", (error) => {
    expect(getKeplrConnectionErrorMessage(error)).toBe("Wallet connection failed")
  })
})
