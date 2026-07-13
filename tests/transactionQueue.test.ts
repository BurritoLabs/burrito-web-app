import { describe, expect, it } from "vitest"
import { runSerializedTransaction } from "../src/app/tx/transactionQueue"

describe("transaction queue", () => {
  it("serializes operations for the same account", async () => {
    const events: string[] = []
    let releaseFirst: () => void = () => {}
    let markFirstStarted: () => void = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })

    const first = runSerializedTransaction("phoenix-1:terra1", async () => {
      events.push("first:start")
      markFirstStarted()
      await firstGate
      events.push("first:end")
      return 1
    })
    const second = runSerializedTransaction("phoenix-1:terra1", async () => {
      events.push("second:start")
      return 2
    })

    await firstStarted
    expect(events).toEqual(["first:start"])
    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
    expect(events).toEqual(["first:start", "first:end", "second:start"])
  })

  it("does not block other accounts and recovers after a failure", async () => {
    const other = runSerializedTransaction("columbus-5:terra2", async () => "other")
    const failed = runSerializedTransaction("columbus-5:terra1", async () => {
      throw new Error("rejected")
    })

    await expect(other).resolves.toBe("other")
    await expect(failed).rejects.toThrow("rejected")
    await expect(
      runSerializedTransaction("columbus-5:terra1", async () => "recovered")
    ).resolves.toBe("recovered")
  })
})
