import { expect, test, type Page } from "@playwright/test"

const APP_CHAIN_STORAGE_KEY = "burrito:web-app:chain"
const routes = [
  ["/", "Dashboard"],
  ["/wallet", "Wallet"],
  ["/swap", "Swap"],
  ["/market", "Market"],
  ["/launchpad", "Launchpad"],
  ["/history", "History"],
  ["/stake", "Stake"],
  ["/gov", "Governance"],
  ["/contract", "Contract"],
  ["/privacy", "Privacy Policy"]
] as const

const selectStoredChain = async (page: Page, chainKey: "lunc" | "luna") => {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: APP_CHAIN_STORAGE_KEY, value: chainKey }
  )
}

for (const chainKey of ["lunc", "luna"] as const) {
  test(`${chainKey} production routes render`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await selectStoredChain(page, chainKey)

    for (const [path, title] of routes) {
      await page.goto(path, { waitUntil: "domcontentloaded" })
      await expect(page.locator("html")).toHaveAttribute("data-app-chain", chainKey)
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, `${chainKey} ${path} horizontal overflow`).toBeLessThanOrEqual(1)
    }

    expect(pageErrors).toEqual([])
  })
}

test("production network switch preserves the route", async ({ page }) => {
  await selectStoredChain(page, "lunc")
  await page.goto("/market", { waitUntil: "domcontentloaded" })

  await page.getByRole("button", { name: "Switch network" }).click()
  await page.getByRole("menuitem").filter({ hasText: "LUNA" }).click()

  await expect(page).toHaveURL(/\/market$/)
  await expect(page.locator("html")).toHaveAttribute("data-app-chain", "luna")
})

test("production mobile header remains fixed above content", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile viewport only")
  await page.goto("/market", { waitUntil: "domcontentloaded" })

  const header = page.getByRole("banner")
  await expect(header).toBeVisible()
  await expect(header).toHaveCSS("position", "fixed")

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(200)

  const metrics = await header.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, zIndex: Number(getComputedStyle(element).zIndex) || 0 }
  })
  expect(metrics.top).toBeGreaterThanOrEqual(0)
  expect(metrics.top).toBeLessThan(2)
  expect(metrics.zIndex).toBeGreaterThanOrEqual(500)
})
