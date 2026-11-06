import { expect, test } from "@playwright/test"

// Real application UI, without a mocked provider or connection/signing request.
test("wallet connection dialog is named and contains keyboard focus", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("A local Playwright baseURL is required")
  const origin = new URL(baseURL).origin
  expect(new URL(origin).hostname).toBe("127.0.0.1")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin || !["document", "script", "stylesheet", "image", "font"].includes(request.resourceType())) {
      await route.abort("internetdisconnected")
      return
    }
    await route.continue()
  })
  await page.routeWebSocket(/.*/, (socket) => socket.close())
  await page.goto("/privacy")
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible()
  const trigger = page.getByRole("button", { name: "Connect", exact: true }).first()
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Connect wallet", exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()
  const controls = dialog.locator('button:not([disabled]), a[href], [tabindex="0"]')
  await controls.last().focus()
  await page.keyboard.press("Tab")
  await expect(controls.first()).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(controls.last()).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(dialog).toBeFocused()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
})
