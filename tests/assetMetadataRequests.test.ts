import { describe, expect, it } from "vitest"
import {
  mapSettledWithConcurrency,
  withInFlightAssetRequest
} from "../src/app/data/assetMetadataRequests"

describe("asset metadata request coordination", () => {
  it("shares only the same chain-and-asset request while it is pending", async () => {
    const resolveRequests: Array<(value: string) => void> = []
    const operation = () => new Promise<string>((resolve) => { resolveRequests.push(resolve) })
    const first = withInFlightAssetRequest("columbus-5", "cw20:token-a", operation)
    const duplicate = withInFlightAssetRequest("columbus-5", "cw20:token-a", operation)
    const otherChain = withInFlightAssetRequest("phoenix-1", "cw20:token-a", operation)
    const otherAsset = withInFlightAssetRequest("columbus-5", "cw20:token-b", operation)
    const otherEndpoint = withInFlightAssetRequest("columbus-5", "https://other-lcd/cw20:token-a", operation)

    expect(first).toBe(duplicate)
    expect(first).not.toBe(otherChain)
    expect(first).not.toBe(otherAsset)
    expect(first).not.toBe(otherEndpoint)
    await Promise.resolve()
    expect(resolveRequests).toHaveLength(4)
    resolveRequests.forEach((resolve) => resolve("metadata"))
    await Promise.all([first, duplicate, otherChain, otherAsset, otherEndpoint])
  })

  it("keeps successes when one item fails and respects the batch concurrency cap", async () => {
    const values = Array.from({ length: 20 }, (_, index) => index)
    let active = 0
    let maximumActive = 0
    const settled = await mapSettledWithConcurrency(values, 8, async (value) => {
      active++
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      if (value === 7) throw new Error("fixture failure")
      return value * 2
    })

    expect(maximumActive).toBeLessThanOrEqual(8)
    expect(settled[7]).toMatchObject({ status: "rejected" })
    expect(settled[8]).toEqual({ status: "fulfilled", value: 16 })
    expect(settled).toHaveLength(values.length)
  })

  it("releases failed and completed requests so subsequent reads can retry", async () => {
    let calls = 0
    const operation = async () => {
      calls++
      if (calls === 1) throw new Error("temporary metadata failure")
      return calls
    }
    const read = () => withInFlightAssetRequest("retry-chain", "token-info", operation)
    await expect(read()).rejects.toThrow("temporary metadata failure")
    await expect(read()).resolves.toBe(2)
    await expect(read()).resolves.toBe(3)
  })
})
