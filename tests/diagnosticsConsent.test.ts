import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const key = "burrito:diagnostics-consent:v1"

describe("explicit diagnostics consent", () => {
  let values: Map<string, string>
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> }
  let events: EventTarget
  let consent: typeof import("../src/app/feedback/diagnosticsConsent")
  let unsubscribes: (() => void)[]

  beforeEach(async () => {
    vi.resetModules()
    values = new Map()
    storage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => { values.set(name, value) })
    }
    events = Object.assign(new EventTarget(), { localStorage: storage })
    vi.stubGlobal("window", events)
    unsubscribes = []
    consent = await import("../src/app/feedback/diagnosticsConsent")
  })

  afterEach(() => {
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const storageEvent = (eventKey: string | null, newValue: string | null, storageArea: unknown = storage) => {
    events.dispatchEvent(Object.assign(new Event("storage"), { key: eventKey, newValue, storageArea }))
  }

  it("defaults off without writing or migrating an older grant", () => {
    values.set("burrito:diagnostics-consent", "granted")
    values.set("burrito:diagnostics-consent:v0", "granted")
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(["true", "1", "GRANTED", "granted ", '"granted"', "denied", "", "unknown"])("does not treat %j as permission", (value) => {
    values.set(key, value)
    expect(consent.getDiagnosticsConsent()).toBe(false)
  })

  it("accepts only the exact granted value and checks storage again on every read", () => {
    values.set(key, "granted")
    expect(consent.getDiagnosticsConsent()).toBe(true)
    values.delete(key)
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(storage.getItem).toHaveBeenCalledTimes(2)
  })

  it("persists and verifies explicit choices and notifies the same tab", () => {
    const observed: boolean[] = []
    unsubscribes.push(consent.subscribeDiagnosticsConsent(() => observed.push(consent.getDiagnosticsConsent())))
    expect(consent.setDiagnosticsConsent(true)).toBe(true)
    expect(values.get(key)).toBe("granted")
    expect(consent.setDiagnosticsConsent(false)).toBe(true)
    expect(values.get(key)).toBe("denied")
    expect(observed).toEqual([true, false])
  })

  it("shares one storage listener and keeps subscriptions independently removable", () => {
    const add = vi.spyOn(events, "addEventListener")
    const remove = vi.spyOn(events, "removeEventListener")
    const listener = vi.fn()
    const first = consent.subscribeDiagnosticsConsent(listener)
    const second = consent.subscribeDiagnosticsConsent(listener)
    unsubscribes.push(first, second)
    expect(add).toHaveBeenCalledTimes(1)
    first()
    consent.setDiagnosticsConsent(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    second()
    expect(remove).toHaveBeenCalledTimes(1)
    storageEvent(key, "denied")
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("handles cross-tab grants, revocation and clear, without trusting stale event values", () => {
    const observed: boolean[] = []
    unsubscribes.push(consent.subscribeDiagnosticsConsent(() => observed.push(consent.getDiagnosticsConsent())))
    values.set(key, "granted")
    storageEvent(key, "granted")
    values.set(key, "denied")
    storageEvent(key, "granted")
    values.clear()
    storageEvent(null, null)
    storageEvent("unrelated", "granted")
    storageEvent(key, "granted", {})
    expect(observed).toEqual([true, false, false])
  })

  it("failed withdrawal closes this page even if an old persisted grant remains", () => {
    values.set(key, "granted")
    const observed: boolean[] = []
    unsubscribes.push(consent.subscribeDiagnosticsConsent(() => observed.push(consent.getDiagnosticsConsent())))
    storage.setItem.mockImplementationOnce(() => { throw new Error("Storage unavailable") })
    expect(consent.setDiagnosticsConsent(false)).toBe(false)
    expect(values.get(key)).toBe("granted")
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(observed).toEqual([false])
    storageEvent(key, "granted")
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(consent.setDiagnosticsConsent(true)).toBe(true)
    expect(consent.getDiagnosticsConsent()).toBe(true)
  })

  it("a read failure notifies collectors off and remains closed until a verified explicit set", () => {
    values.set(key, "granted")
    const observed: boolean[] = []
    unsubscribes.push(consent.subscribeDiagnosticsConsent(() => observed.push(consent.getDiagnosticsConsent())))
    storage.getItem.mockImplementationOnce(() => { throw new Error("Storage unavailable") })
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(observed).toEqual([false])
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(consent.setDiagnosticsConsent(true)).toBe(true)
    expect(consent.getDiagnosticsConsent()).toBe(true)
  })

  it.each(["missing readback", "throwing readback"])("returns false and stays off for %s after a write", (mode) => {
    if (mode === "missing readback") storage.setItem.mockImplementationOnce(() => undefined)
    else storage.getItem.mockImplementationOnce(() => { throw new Error("Readback unavailable") })
    expect(consent.setDiagnosticsConsent(true)).toBe(false)
    values.set(key, "granted")
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(consent.setDiagnosticsConsent(false)).toBe(true)
    expect(values.get(key)).toBe("denied")
  })

  it("stays off when localStorage itself is unavailable", () => {
    Object.defineProperty(events, "localStorage", { get() { throw new Error("Blocked storage") } })
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(consent.setDiagnosticsConsent(true)).toBe(false)
  })

  it("is off and does not write or subscribe without a browser", () => {
    vi.stubGlobal("window", undefined)
    expect(consent.getDiagnosticsConsent()).toBe(false)
    expect(consent.setDiagnosticsConsent(true)).toBe(false)
    expect(() => consent.subscribeDiagnosticsConsent(vi.fn())()).not.toThrow()
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
