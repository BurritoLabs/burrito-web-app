import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const storageKey = "burrito:tx-diagnostics:v1"
const consentKey = "burrito:diagnostics-consent:v1"
const oldRecord = {
  id: "old-record",
  at: "2026-10-01T00:00:00.000Z",
  phase: "failure",
  label: "Old local diagnostic"
}

describe("clearing local transaction diagnostics", () => {
  let values: Map<string, string>
  let storage: {
    getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>
    setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>
    removeItem: ReturnType<typeof vi.fn<(key: string) => void>>
    clear: ReturnType<typeof vi.fn>
  }
  let fetchMock: ReturnType<typeof vi.fn>
  let beacon: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("VITE_TX_DIAGNOSTICS_ENDPOINT", "https://diagnostics.example.test/transactions")
    values = new Map([
      [storageKey, JSON.stringify([oldRecord])],
      [consentKey, "granted"],
      ["wallet:test-preference", "unchanged-wallet-value"],
      ["theme:test-preference", "dark"],
      [`${storageKey}:other`, "unchanged-neighbor"]
    ])
    storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
      removeItem: vi.fn((key: string) => { values.delete(key) }),
      clear: vi.fn()
    }
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    beacon = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("navigator", { sendBeacon: beacon })
    vi.stubGlobal("window", {
      localStorage: storage,
      location: { pathname: "/commission" },
      navigator: { onLine: true, userAgent: "Local diagnostics clear test" }
    })
    vi.stubGlobal("document", { visibilityState: "visible" })
  })

  afterEach(() => {
    expect(fetchMock).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("only removes the fixed diagnostics key, then verifies absence without parsing history", async () => {
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")
    const expectedNeighbors = new Map(values)
    expectedNeighbors.delete(storageKey)
    storage.getItem.mockImplementation((key) => {
      expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(storageKey)
      return values.get(key) ?? null
    })
    const parse = vi.spyOn(JSON, "parse")

    expect(clearStoredTxDiagnostics()).toBe(true)

    expect(parse).not.toHaveBeenCalled()
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.clear).not.toHaveBeenCalled()
    expect(values).toEqual(expectedNeighbors)
  })

  it("is idempotent when the diagnostics key is already absent", async () => {
    values.delete(storageKey)
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(true)
    expect(clearStoredTxDiagnostics()).toBe(true)
    expect(storage.removeItem.mock.calls).toEqual([[storageKey], [storageKey]])
    expect(storage.getItem.mock.calls).toEqual([[storageKey], [storageKey]])
    expect(values.get(consentKey)).toBe("granted")
  })

  it("returns false during SSR without accessing storage", async () => {
    vi.stubGlobal("window", undefined)
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(false)
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it("returns false if the localStorage getter throws", async () => {
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", {
      get: () => { throw new Error("Storage unavailable") }
    }))
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(false)
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it.each([undefined, null])("returns false when localStorage is unavailable (%s)", async (unavailable) => {
    vi.stubGlobal("window", { localStorage: unavailable })
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(false)
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it("swallows removal failure without reading the remaining history", async () => {
    storage.removeItem.mockImplementation(() => { throw new Error("Removal unavailable") })
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(false)
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(values.get(storageKey)).toBe(JSON.stringify([oldRecord]))
  })

  it("returns false if readback fails even after removal succeeded", async () => {
    storage.getItem.mockImplementation(() => { throw new Error("Readback unavailable") })
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(false)
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(values.has(storageKey)).toBe(false)
  })

  it.each(["[]", ""])("returns false unless readback is exactly null (%j)", async (remaining) => {
    values.set(storageKey, remaining)
    storage.removeItem.mockImplementation(() => undefined)
    const { clearStoredTxDiagnostics } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(false)
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(values.get(storageKey)).toBe(remaining)
  })

  it("allows new local records afterward and never includes cleared records in copied diagnostics", async () => {
    values.set(consentKey, "denied")
    const {
      clearStoredTxDiagnostics, recordTxDiagnostic,
      getStoredTxDiagnostics, buildTxDiagnosticsReport
    } = await import("../src/app/tx/txDiagnostics")

    expect(clearStoredTxDiagnostics()).toBe(true)
    expect(getStoredTxDiagnostics()).toEqual([])
    expect(JSON.parse(buildTxDiagnosticsReport()).events).toEqual([])

    recordTxDiagnostic({ phase: "success", label: "New local diagnostic" })

    const stored = getStoredTxDiagnostics()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ phase: "success", label: "New local diagnostic" })
    const copied = buildTxDiagnosticsReport()
    expect(JSON.parse(copied).events).toEqual(stored)
    expect(copied).not.toContain(oldRecord.label)
    expect(copied).not.toContain(oldRecord.id)
    expect(values.get(consentKey)).toBe("denied")
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(storage.setItem.mock.calls.every(([key]) => key === storageKey)).toBe(true)
    expect(storage.clear).not.toHaveBeenCalled()
  })
})
