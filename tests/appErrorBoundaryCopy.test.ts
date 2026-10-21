import React, { createElement, type ComponentProps, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AppErrorBoundary from "../src/app/feedback/AppErrorBoundary"
import DataErrorCard from "../src/app/feedback/DataErrorCard"
import { reportRuntimeError } from "../src/app/feedback/runtimeErrorReporter"

vi.mock("../src/app/feedback/runtimeErrorReporter", () => ({
  reportRuntimeError: vi.fn(),
  sanitizeClientErrorText: vi.fn((message: string) => `filtered:${message}`)
}))
vi.mock("../src/app/utils/safeStorage", () => ({
  clearVolatileStorageCaches: vi.fn()
}))

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Pure lifecycle tests: state updates are applied explicitly, without a DOM,
// browser, real clipboard, diagnostics transport, or actual navigation.
const mountBoundary = (error = new Error("Synthetic runtime error")) => {
  const boundary = new AppErrorBoundary({ children: "Healthy content" })
  boundary.state = AppErrorBoundary.getDerivedStateFromError(error)
  const applyUpdate: typeof boundary.setState = (update) => {
    const next = typeof update === "function" ? update(boundary.state, boundary.props) : update
    if (next) boundary.state = { ...boundary.state, ...next }
  }
  const updates = vi.spyOn(boundary, "setState").mockImplementation(applyUpdate)
  boundary.componentDidMount()
  const props = () => (boundary.render() as ReactElement<ComponentProps<typeof DataErrorCard>>).props
  return { boundary, applyUpdate, updates, props }
}

describe("runtime fallback diagnostic copy", () => {
  let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
  let replace: ReturnType<typeof vi.fn>
  let sessionStorage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"))
    // Vitest's TSX transform uses the classic JSX runtime in this Node suite.
    vi.stubGlobal("React", React)
    writeText = vi.fn().mockResolvedValue(undefined)
    replace = vi.fn()
    sessionStorage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal("window", {
      navigator: { clipboard: { writeText }, userAgent: "Synthetic test browser" },
      location: { pathname: "/privacy", href: "https://example.test/privacy", replace },
      sessionStorage,
      setTimeout: vi.fn(globalThis.setTimeout),
      clearTimeout: vi.fn(globalThis.clearTimeout)
    })
    vi.stubEnv("DEV", false)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("disables copying while pending and coalesces duplicate calls", async () => {
    const pending = deferred()
    writeText.mockReturnValue(pending.promise)
    const { boundary, props } = mountBoundary()
    const copy = boundary.handleCopyDiagnostics()
    expect(props().secondaryActionLabel).toBe("Copying diagnostics…")
    expect(props().secondaryActionPending).toBe(true)
    expect(props().secondaryActionStatus).toBe("Copying diagnostics…")
    await boundary.handleCopyDiagnostics()
    expect(writeText).toHaveBeenCalledTimes(1)
    pending.resolve()
    await copy
    expect(props().secondaryActionPending).toBe(false)
    expect(props().secondaryActionLabel).toBe("Diagnostics copied")
    expect(props().secondaryActionStatus).toBe("Diagnostics copied.")
  })

  it("keeps the existing bounded runtime-only report scope", async () => {
    const { boundary } = mountBoundary()
    await boundary.handleCopyDiagnostics()
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
      generatedAt: "2026-10-01T12:00:00.000Z",
      path: "/privacy",
      message: "filtered:Synthetic runtime error",
      userAgent: "Synthetic test browser"
    })
    expect(reportRuntimeError).not.toHaveBeenCalled()
  })

  it("announces failure without claiming success and clears it immediately on retry", async () => {
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"))
    const { boundary, props } = mountBoundary()
    await boundary.handleCopyDiagnostics()
    expect(props().secondaryActionLabel).toBe("Copy diagnostics")
    expect(props().secondaryActionPending).toBe(false)
    expect(props().secondaryActionStatus).toBe("Could not copy diagnostics. Clipboard access may be unavailable. Please try again.")
    const retry = deferred()
    writeText.mockReturnValueOnce(retry.promise)
    const copy = boundary.handleCopyDiagnostics()
    expect(props().secondaryActionStatus).toBe("Copying diagnostics…")
    expect(props().secondaryActionPending).toBe(true)
    retry.resolve()
    await copy
    expect(props().secondaryActionStatus).toBe("Diagnostics copied.")
  })

  it("reports unavailable clipboard access as a retryable failure", async () => {
    Object.defineProperty(window.navigator, "clipboard", { value: undefined })
    const { boundary, props } = mountBoundary()
    await boundary.handleCopyDiagnostics()
    expect(props().secondaryActionStatus).toMatch(/^Could not copy diagnostics\./)
    expect(props().secondaryActionPending).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it("reports synchronous clipboard exceptions as failure", async () => {
    writeText.mockImplementation(() => { throw new Error("Clipboard access blocked") })
    const { boundary, props } = mountBoundary()
    await boundary.handleCopyDiagnostics()
    expect(props().secondaryActionLabel).toBe("Copy diagnostics")
    expect(props().secondaryActionStatus).toMatch(/^Could not copy diagnostics\./)
  })

  it.each(["resolve", "reject"] as const)("ignores a late %s after unmount", async (settlement) => {
    const pending = deferred()
    writeText.mockReturnValue(pending.promise)
    const { boundary, updates } = mountBoundary()
    const copy = boundary.handleCopyDiagnostics()
    boundary.componentWillUnmount()
    updates.mockClear()
    if (settlement === "resolve") pending.resolve()
    else pending.reject(new Error("Late denial"))
    await copy
    expect(updates).not.toHaveBeenCalled()
    await boundary.handleCopyDiagnostics()
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it.each(["resolve", "reject"] as const)("ignores a late %s after Reload without altering normal reload behavior", async (settlement) => {
    const pending = deferred()
    writeText.mockReturnValue(pending.promise)
    const { boundary, updates, props } = mountBoundary()
    const copy = boundary.handleCopyDiagnostics()
    boundary.handleReload()
    expect(props().secondaryActionLabel).toBe("Copy diagnostics")
    expect(props().secondaryActionStatus).toBeUndefined()
    expect(sessionStorage.removeItem.mock.calls).toEqual([["burrito.appRecoveryAt"], ["burrito.staleAssetRecovery"]])
    expect(replace).toHaveBeenCalledTimes(1)
    expect(new URL(replace.mock.calls[0][0]).pathname).toBe("/privacy")
    updates.mockClear()
    if (settlement === "resolve") pending.resolve()
    else pending.reject(new Error("Late denial"))
    await copy
    expect(updates).not.toHaveBeenCalled()
  })

  it.each(["resolve", "reject"] as const)("isolates a late %s from a newer error and copy attempt", async (settlement) => {
    const old = deferred()
    const current = deferred()
    writeText.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const { boundary, props } = mountBoundary()
    const oldCopy = boundary.handleCopyDiagnostics()
    const nextError = new Error("New runtime error")
    boundary.state = AppErrorBoundary.getDerivedStateFromError(nextError)
    boundary.componentDidCatch(nextError, { componentStack: "" })
    expect(props().secondaryActionLabel).toBe("Copy diagnostics")
    const currentCopy = boundary.handleCopyDiagnostics()
    if (settlement === "resolve") old.resolve()
    else old.reject(new Error("Late denial"))
    await oldCopy
    expect(props().secondaryActionPending).toBe(true)
    await boundary.handleCopyDiagnostics()
    expect(writeText).toHaveBeenCalledTimes(2)
    current.resolve()
    await currentCopy
    expect(props().secondaryActionLabel).toBe("Diagnostics copied")
    expect(JSON.parse(writeText.mock.calls[1][0]).message).toBe("filtered:New runtime error")
  })

  it("also invalidates a copy when the same Error object is caught again", async () => {
    const pending = deferred()
    writeText.mockReturnValue(pending.promise)
    const error = new Error("Repeated error")
    const { boundary, props } = mountBoundary(error)
    const copy = boundary.handleCopyDiagnostics()
    boundary.state = AppErrorBoundary.getDerivedStateFromError(error)
    boundary.componentDidCatch(error, { componentStack: "" })
    pending.resolve()
    await copy
    expect(props().secondaryActionLabel).toBe("Copy diagnostics")
    expect(props().secondaryActionStatus).toBeUndefined()
  })

  it("rechecks ownership when a queued completion state update is applied", async () => {
    const pending = deferred()
    writeText.mockReturnValue(pending.promise)
    const { boundary, applyUpdate, updates, props } = mountBoundary()
    const copy = boundary.handleCopyDiagnostics()
    const queued: Array<() => void> = []
    updates.mockImplementation((update) => { queued.push(() => applyUpdate(update)) })
    pending.resolve()
    await copy
    expect(queued).toHaveLength(1)
    const nextError = new Error("New runtime error")
    boundary.state = AppErrorBoundary.getDerivedStateFromError(nextError)
    boundary.componentDidCatch(nextError, { componentStack: "" })
    queued.forEach((apply) => apply())
    expect(props().secondaryActionLabel).toBe("Copy diagnostics")
    expect(props().secondaryActionStatus).toBeUndefined()
  })

  it("preserves stale-asset timer delay and clears its scheduled recovery on unmount", () => {
    const error = new Error("Failed to fetch dynamically imported module")
    const { boundary } = mountBoundary(error)
    boundary.componentDidCatch(error, { componentStack: "" })
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2_000)
    vi.advanceTimersByTime(1_999)
    expect(replace).not.toHaveBeenCalled()
    boundary.componentWillUnmount()
    vi.advanceTimersByTime(1)
    expect(window.clearTimeout).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it("keeps automatic non-stale recovery at its existing zero delay", () => {
    const error = new Error("Runtime failure")
    const { boundary } = mountBoundary(error)
    boundary.componentDidCatch(error, { componentStack: "" })
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0)
    vi.advanceTimersByTime(0)
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("exposes a disabled busy control and an atomic status region in the card markup", () => {
    const html = renderToStaticMarkup(createElement(DataErrorCard, {
      secondaryActionLabel: "Copying diagnostics…",
      secondaryActionDescription: "Copies the filtered report.",
      secondaryActionPending: true,
      secondaryActionStatus: "Copying diagnostics…",
      onSecondaryAction: () => undefined
    }))
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"/)
    expect(html).toContain('role="status" aria-atomic="true"')
    const statusId = html.match(/<div id="([^"]+)" role="status"/)?.[1]
    expect(statusId).toBeTruthy()
    expect(html).toContain(` ${statusId}"`)
    expect(html).toContain("Copies the filtered report.")
  })

  it("keeps the empty status region mounted and does not disable an idle action", () => {
    const html = renderToStaticMarkup(createElement(DataErrorCard, {
      secondaryActionLabel: "Copy diagnostics", onSecondaryAction: () => undefined
    }))
    expect(html).toContain('role="status" aria-atomic="true"></div>')
    expect(html).not.toContain("disabled=")
    expect(html).not.toContain("aria-busy=")
  })
})
