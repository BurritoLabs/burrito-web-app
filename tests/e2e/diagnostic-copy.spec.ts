import { expect, test, type Page } from "@playwright/test"

type DiagnosticQA = {
  qaFixtureKind: "transaction" | "runtime"
  qaCopies: string[]
  qaClipboardFail: boolean
  qaClipboardDeferred: boolean
  qaPendingCopies: Array<{ resolve: () => void; reject: () => void }>
  qaSetTransaction: (state: { status: "idle" | "pending" | "error"; error?: string }) => void
}

// Component UI fixtures only: no wallet connector, signature or chain operation.
const mountDiagnosticFixture = async (page: Page, baseURL: string | undefined, kind: "transaction" | "runtime") => {
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Local test server required")
  const origin = new URL(baseURL).origin
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ["document", "script", "stylesheet", "image", "font"].includes(request.resourceType())) {
      await route.continue()
    } else {
      await route.fulfill({ contentType: "application/json", body: "{}" })
    }
  })
  await page.addInitScript((kind: "transaction" | "runtime") => {
    const qa = window as unknown as DiagnosticQA
    qa.qaFixtureKind = kind
    qa.qaCopies = []
    qa.qaClipboardFail = false
    qa.qaClipboardDeferred = false
    qa.qaPendingCopies = []
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => {
        if (qa.qaClipboardFail) throw new Error("Synthetic blocked clipboard")
        if (qa.qaClipboardDeferred) await new Promise<void>((resolve, reject) => {
          qa.qaPendingCopies.push({ resolve, reject: () => reject(new Error("Synthetic delayed failure")) })
        })
        qa.qaCopies.push(value)
      }
    } })
    localStorage.setItem("burrito:diagnostics-consent:v1", "denied")
    localStorage.setItem("burrito:tx-diagnostics:v1", JSON.stringify([
      { id: "synthetic-1", phase: "failure", rawMessage: "Synthetic QA error", accountAddress: "SYNTHETIC_PUBLIC_ADDRESS" },
      { id: "synthetic-2", phase: "start", label: "Synthetic QA action" }
    ]))
    sessionStorage.setItem("burrito.appRecoveryAt", String(Date.now()))
  }, kind)
  await page.route(/\/src\/main\.tsx(?:\?|$)/, async (route) => {
    // Let Vite resolve ordinary package imports and version its optimized
    // dependencies. A guessed .vite/deps filename can be absent on a cold run.
    await route.fulfill({
      contentType: "text/javascript",
      body: 'import "/tests/e2e/fixtures/diagnostic-copy.tsx";'
    })
  })
  await page.goto("/privacy")
  await expect(page).toHaveTitle("Diagnostic copy QA fixture")
}

test("diagnostic fixtures use bundler-resolved dependency URLs", async ({ page, baseURL }) => {
  const unversionedReactImports: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (/\/node_modules\/\.vite\/deps\/(react|react-dom_client)\.js$/.test(url.pathname) && !url.search) {
      unversionedReactImports.push(url.pathname)
    }
  })
  await mountDiagnosticFixture(page, baseURL, "transaction")
  await expect(page.getByRole("dialog", { name: "Transaction failed", exact: true })).toBeVisible()
  expect(unversionedReactImports).toEqual([])
})

test("transaction diagnostics explain contents before a user-requested copy", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "transaction")
  const dialog = page.getByRole("dialog", { name: "Transaction failed", exact: true })
  await expect(dialog).toBeVisible()
  const copy = dialog.getByRole("button", { name: "Copy diagnostics", exact: true })
  await expect(copy).toHaveAccessibleDescription(/up to eight recent diagnostic records.*public addresses.*transaction hashes.*original errors.*Copying does not upload/)
  expect(await page.evaluate(() => (window as unknown as { qaCopies: string[] }).qaCopies)).toEqual([])
  await copy.click()
  await expect(dialog.getByRole("button", { name: "Diagnostics copied", exact: true })).toBeVisible()
  const reports = await page.evaluate(() => (window as unknown as { qaCopies: string[] }).qaCopies)
  expect(reports).toHaveLength(1)
  expect(JSON.parse(reports[0]).events).toHaveLength(2)
  expect(reports[0]).toContain("SYNTHETIC_PUBLIC_ADDRESS")
  await dialog.getByRole("button", { name: "Close transaction status", exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test("blocked transaction clipboard access does not report a successful copy", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "transaction")
  await page.evaluate(() => { (window as unknown as { qaClipboardFail: boolean }).qaClipboardFail = true })
  await page.getByRole("button", { name: "Copy diagnostics", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Copy failed")
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { qaCopies: string[] }).qaCopies)).toEqual([])
})

test("runtime fallback describes its different report without claiming transaction history", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "runtime")
  await expect(page.getByRole("heading", { name: "Something went wrong.", exact: true })).toBeVisible()
  const copy = page.getByRole("button", { name: "Copy diagnostics", exact: true })
  await expect(copy).toHaveAccessibleDescription(/page path, browser information, timestamp and filtered error message.*Copying does not upload/)
  await copy.click()
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toBeVisible()
  const reports = await page.evaluate(() => (window as unknown as { qaCopies: string[] }).qaCopies)
  expect(reports).toHaveLength(1)
  const report = JSON.parse(reports[0])
  expect(report.path).toBe("/privacy")
  expect(report.message).toBe("Synthetic QA runtime error")
  expect(report).not.toHaveProperty("events")
  expect(reports[0]).not.toContain("SYNTHETIC_PUBLIC_ADDRESS")
})

test("a continuously mounted transaction modal does not retain the previous copy result", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "transaction")
  await page.getByRole("button", { name: "Copy diagnostics", exact: true }).click()
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toBeVisible()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaSetTransaction({ status: "idle" }))
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Open synthetic transaction" }).click()
  await expect(page.getByRole("button", { name: "Copy diagnostics", exact: true })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as DiagnosticQA).qaCopies.length)).toBe(1)
})

test("a late clipboard result cannot overwrite a newer transaction copy attempt", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "transaction")
  await page.evaluate(() => { (window as unknown as DiagnosticQA).qaClipboardDeferred = true })
  await page.getByRole("button", { name: "Copy diagnostics", exact: true }).click()
  await expect(page.getByRole("button", { name: "Copying…", exact: true })).toBeDisabled()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaSetTransaction({ status: "idle" }))
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Open synthetic transaction" }).click()
  await page.getByRole("button", { name: "Copy diagnostics", exact: true }).click()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaPendingCopies[0].resolve())
  await expect(page.getByRole("button", { name: "Copying…", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toHaveCount(0)
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaPendingCopies[1].reject())
  await expect(page.getByRole("status")).toContainText("Copy failed")
  await expect(page.getByRole("button", { name: "Copy diagnostics", exact: true })).toBeEnabled()
})

test("transaction dialog contains keyboard focus and restores it without closing a pending broadcast", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "transaction")
  await page.getByRole("button", { name: "Close transaction status", exact: true }).click()
  const trigger = page.getByRole("button", { name: "Open synthetic transaction" })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Transaction failed", exact: true })
  await expect(dialog).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(dialog.getByRole("button", { name: "Close transaction status", exact: true })).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaSetTransaction({ status: "pending" }))
  const pending = page.getByRole("dialog", { name: "Broadcasting transaction", exact: true })
  await expect(pending).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(pending).toBeVisible()
  await page.keyboard.press("Tab")
  await expect(pending).toBeFocused()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaSetTransaction({ status: "error", error: "Synthetic terminal error" }))
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.getByRole("button", { name: "Close transaction status", exact: true }).focus()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaSetTransaction({ status: "pending" }))
  await expect(pending).toBeFocused()
  await page.evaluate(() => (window as unknown as DiagnosticQA).qaSetTransaction({ status: "error", error: "Synthetic final error" }))
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("runtime clipboard failure is announced and a successful retry clears the failure", async ({ page, baseURL }) => {
  await mountDiagnosticFixture(page, baseURL, "runtime")
  await page.evaluate(() => { (window as unknown as DiagnosticQA).qaClipboardFail = true })
  await page.getByRole("button", { name: "Copy diagnostics", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Could not copy diagnostics")
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toHaveCount(0)
  await page.evaluate(() => { (window as unknown as DiagnosticQA).qaClipboardFail = false })
  await page.getByRole("button", { name: "Copy diagnostics", exact: true }).click()
  await expect(page.getByRole("button", { name: "Diagnostics copied", exact: true })).toBeVisible()
  await expect(page.getByRole("status")).not.toContainText("Could not copy diagnostics")
})
