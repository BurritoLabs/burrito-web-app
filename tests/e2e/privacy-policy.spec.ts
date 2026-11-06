import { expect, test } from "@playwright/test"

const CONSENT_KEY = "burrito:diagnostics-consent:v1"

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") {
    throw new Error("Privacy checks require the isolated local test server")
  }
  const origin = new URL(baseURL).origin
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin &&
        ["document", "script", "stylesheet", "image", "font"].includes(request.resourceType())) {
      await route.continue()
    } else {
      // No diagnostics, chain lookup or other request leaves the test browser.
      await route.fulfill({ contentType: "application/json", body: '{"cw20":[],"ibc":[]}' })
    }
  })
})

test("optional diagnostics require an explicit choice and remember withdrawal", async ({ page }) => {
  await page.goto("/privacy")
  const toggle = page.getByRole("switch", { name: "Share optional diagnostics", exact: true })
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBeNull()
  await toggle.focus()
  await page.keyboard.press("Space")
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBe("granted")
  await page.reload()
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await page.reload()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBe("denied")
})

test("diagnostic choices synchronize across open tabs and storage removal", async ({ page, context }) => {
  await page.goto("/privacy")
  const second = await context.newPage()
  await second.goto("/privacy")
  const firstToggle = page.getByRole("switch", { name: "Share optional diagnostics", exact: true })
  const secondToggle = second.getByRole("switch", { name: "Share optional diagnostics", exact: true })
  await expect(firstToggle).toHaveAttribute("aria-checked", "false")
  await expect(secondToggle).toHaveAttribute("aria-checked", "false")
  await firstToggle.click()
  await expect(secondToggle).toHaveAttribute("aria-checked", "true")
  await secondToggle.click()
  await expect(firstToggle).toHaveAttribute("aria-checked", "false")
  await firstToggle.click()
  await expect(secondToggle).toHaveAttribute("aria-checked", "true")
  await second.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY)
  await expect(firstToggle).toHaveAttribute("aria-checked", "false")
  await second.close()
})

test("a failed withdrawal stops sharing and retries the original Off choice", async ({ page }) => {
  await page.goto("/privacy")
  const toggle = page.getByRole("switch", { name: "Share optional diagnostics", exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    let denyNextWrite = true
    Storage.prototype.setItem = function (name, value) {
      if (name === key && denyNextWrite) {
        denyNextWrite = false
        throw new DOMException("Synthetic QA storage failure", "QuotaExceededError")
      }
      return original.call(this, name, value)
    }
  }, CONSENT_KEY)
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await expect(page.getByRole("alert")).toContainText("Your Off choice could not be saved")
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBe("granted")
  await page.getByRole("button", { name: "Retry saving choice", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBe("denied")
  await page.reload()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
})

test("runtime error transport sends only during the consented interval", async ({ page }) => {
  const reports: string[] = []
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/client-errors")) {
      reports.push(request.postData() || "")
    }
  })
  const emitError = (message: string) => page.evaluate(async (value) => {
    window.dispatchEvent(new ErrorEvent("error", { error: new Error(value), message: value }))
    await new Promise((resolve) => setTimeout(resolve, 50))
  }, message)
  await page.goto("/privacy")
  const toggle = page.getByRole("switch", { name: "Share optional diagnostics", exact: true })
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await emitError("Synthetic QA error before permission")
  expect(reports).toHaveLength(0)
  await toggle.click()
  await emitError("Synthetic QA error after permission")
  await expect.poll(() => reports.length).toBe(1)
  expect(reports[0]).toContain("Synthetic QA error after permission")
  await toggle.click()
  await emitError("Synthetic QA error after withdrawal")
  expect(reports).toHaveLength(1)
})

test("privacy policy explains connected sites and off-device processing", async ({ page }) => {
  await page.goto("/privacy")
  await expect(page).toHaveTitle("Privacy Policy | Burrito")
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible()

  const policy = page.locator("main article")
  const extension = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Chrome extension", exact: true })
  })
  await extension.scrollIntoViewIfNeeded()
  for (const host of ["app.burrito.money", "dex.burrito.money", "ai.burrito.money", "studio.burrito.money"]) {
    await expect(extension).toContainText(host)
  }
  await expect(extension).toContainText("its own connection approval")
  await expect(extension).toContainText("off-chain messages")
  await expect(extension).toContainText("revoke")
  await expect(extension).toContainText("extension-page local storage")

  const diagnostics = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Performance and error reporting", exact: true })
  })
  await diagnostics.scrollIntoViewIfNeeded()
  await expect(diagnostics).toContainText("Reporting does not require a connected wallet")
  await expect(diagnostics).toContainText("inside the mobile app")
  await expect(diagnostics).toContainText("runtime-error reporting")
  await expect(policy).toContainText("public address to the relevant blockchain data service")
  await expect(policy).toContainText("Connected external wallets apply their own")

  const contact = policy.getByRole("link", { name: "hello@burritolabs.ca", exact: true })
  await contact.scrollIntoViewIfNeeded()
  await expect(contact).toBeVisible()
  await expect(contact).toHaveAttribute("href", "mailto:hello@burritolabs.ca")
})

test("local diagnostic clearing is confirmed and preserves unrelated settings", async ({ page }) => {
  await page.goto("/privacy")
  const fixture = [{ id: "synthetic-local-record", phase: "failure", message: "Synthetic QA failure" }]
  await page.evaluate(({ records, consentKey }) => {
    localStorage.setItem("burrito:tx-diagnostics:v1", JSON.stringify(records))
    localStorage.setItem("burrito:qa:unrelated", "keep-this-test-marker")
    localStorage.setItem(consentKey, "denied")
  }, { records: fixture, consentKey: CONSENT_KEY })
  const trigger = page.getByRole("button", { name: "Clear local diagnostics", exact: true })
  await trigger.click()
  const confirm = page.getByRole("group", { name: "Clear local diagnostic records?", exact: true })
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("burrito:tx-diagnostics:v1") || "[]"))).toEqual(fixture)
  await trigger.click()
  await confirm.getByRole("button", { name: "Clear records", exact: true }).click()
  await expect(page.getByRole("status", { name: "", exact: true }).filter({ hasText: "Local transaction diagnostics cleared." })).toBeVisible()
  await expect(trigger).toBeFocused()
  const storage = await page.evaluate((consentKey) => ({
    diagnostics: localStorage.getItem("burrito:tx-diagnostics:v1"),
    other: localStorage.getItem("burrito:qa:unrelated"),
    consent: localStorage.getItem(consentKey)
  }), CONSENT_KEY)
  expect(storage).toEqual({ diagnostics: null, other: "keep-this-test-marker", consent: "denied" })
})

test("a failed local diagnostic clear reports failure and can be retried", async ({ page }) => {
  await page.goto("/privacy")
  await page.evaluate(() => {
    const key = "burrito:tx-diagnostics:v1"
    localStorage.setItem(key, '[{"id":"synthetic-qa"}]')
    const original = Storage.prototype.removeItem
    let fail = true
    Storage.prototype.removeItem = function (name) {
      if (name === key && fail) {
        fail = false
        throw new DOMException("Synthetic removal failure", "SecurityError")
      }
      return original.call(this, name)
    }
  })
  const trigger = page.getByRole("button", { name: "Clear local diagnostics", exact: true })
  await trigger.click()
  await page.getByRole("button", { name: "Clear records", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Could not clear local diagnostics")
  expect(await page.evaluate(() => localStorage.getItem("burrito:tx-diagnostics:v1"))).not.toBeNull()
  await expect(page.getByText("Local transaction diagnostics cleared.", { exact: true })).toHaveCount(0)
  await trigger.click()
  await page.getByRole("button", { name: "Clear records", exact: true }).click()
  await expect(page.getByText("Local transaction diagnostics cleared.", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("burrito:tx-diagnostics:v1"))).toBeNull()
})

test("privacy distinguishes local custody from lookup and deletion boundaries", async ({ page }) => {
  await page.goto("/privacy")
  const policy = page.locator("main article")
  await expect(policy.locator("time")).toHaveAttribute("datetime", "2026-10-01")

  const custody = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Non-custodial wallet", exact: true })
  })
  await custody.scrollIntoViewIfNeeded()
  await expect(custody).toContainText("password-encrypted local vaults")
  await expect(custody).toContainText("using or displaying them")
  await expect(custody).toContainText("retrieves the phrase locally after device-owner authentication")
  await expect(custody).toContainText("select one word at a time to display")
  await expect(custody).toContainText("screen readers can read the word you select")
  await expect(custody).toContainText("The phrase is not passed to the embedded web app")
  await expect(custody).toContainText("reveal it after password verification")

  const services = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Blockchain and service providers", exact: true })
  })
  await services.scrollIntoViewIfNeeded()
  await expect(services).toContainText("identifiers of the assets being priced")
  await expect(services).toContainText("does not require connecting")
  await expect(services).toContainText("before signing approval")
  await expect(services).toContainText("Explorer navigation is separate")
  await expect(services).toContainText("their own browser cookies")

  const retention = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Retention and your choices", exact: true })
  })
  await retention.scrollIntoViewIfNeeded()
  await expect(retention).toContainText("Other stored wallets and the shared theme preference remain")
  await expect(retention).toContainText("it is not a guarantee that every copy has been physically erased")
  await expect(retention).toContainText("moving the app to the background clears the displayed recovery word")
  await expect(retention).toContainText("Opening backup review again requires device-owner authentication")
  await expect(retention).toContainText("Hiding the words does not delete the saved wallet")
  await expect(retention).toContainText("physically erased from device-managed memory")
  await expect(retention).toContainText("Uninstalling the app alone is not a guarantee")
  await expect(retention).toContainText("This does not clear the embedded web app's separate website storage or cache")
  await expect(retention).toContainText("Local wallet removal cannot delete public blockchain records or establish deletion")
  await expect(retention).toContainText("request records retained by their operators")
  await expect(page.locator("vite-error-overlay")).toHaveCount(0)
})
