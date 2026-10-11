import { fromBech32, toBech32 } from "@cosmjs/encoding"
import { describe, expect, it } from "vitest"
import { parseDistributionTransfers } from "../src/app/launchpad/pageModel"

const accountAddress = "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0"
const contractAddress =
  "terra1zs54uanqzwh2y4a6z9xlzawjyjp3tddd99ad0h58ghr5yh2fdfjq95gmcv"

describe("launchpad distribution recipient validation", () => {
  it("accepts valid Terra account and contract address lengths", () => {
    const transfers = parseDistributionTransfers(
      `${accountAddress} 1.25\n${contractAddress} 2`,
      6,
      "TACO"
    )

    expect(transfers).toEqual([
      {
        recipient: accountAddress,
        amount: "1250000",
        displayAmount: "1.25"
      },
      {
        recipient: contractAddress,
        amount: "2000000",
        displayAmount: "2"
      }
    ])
  })

  it("rejects a bad checksum, wrong prefix, and unsupported address data length", () => {
    const badChecksum = `${accountAddress.slice(0, -1)}${
      accountAddress.endsWith("q") ? "p" : "q"
    }`
    const accountData = fromBech32(accountAddress).data
    const wrongPrefix = toBech32("cosmos", accountData)
    const unsupportedLength = toBech32("terra", new Uint8Array(21))

    for (const recipient of [badChecksum, wrongPrefix, unsupportedLength]) {
      expect(() =>
        parseDistributionTransfers(`${recipient} 1`, 6, "TACO")
      ).toThrow("Line 1: recipient must be a terra1 address.")
    }
  })
})
