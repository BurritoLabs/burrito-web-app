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
  ["/contract", "Contract"]
] as const

const selectStoredChain = async (page: Page, chainKey: "lunc" | "luna") => {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: APP_CHAIN_STORAGE_KEY, value: chainKey }
  )
}

for (const chainKey of ["lunc", "luna"] as const) {
  test(`${chainKey} core routes render without crashes or horizontal overflow`, async ({
    page
  }) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await selectStoredChain(page, chainKey)

    for (const [path, title] of routes) {
      await page.goto(path)
      await expect(page.locator("html")).toHaveAttribute("data-app-chain", chainKey)
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Connect", exact: true })
      ).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, `${chainKey} ${path} horizontal overflow`).toBeLessThanOrEqual(1)
    }

    expect(pageErrors).toEqual([])
  })
}

test("network switcher changes the active chain and preserves the current route", async ({
  page
}) => {
  await selectStoredChain(page, "lunc")
  await page.goto("/market")

  await page.getByRole("button", { name: "Switch network" }).click()
  await page.getByRole("menuitem").filter({ hasText: "LUNA" }).click()

  await expect(page).toHaveURL(/\/market$/)
  await expect(page.locator("html")).toHaveAttribute("data-app-chain", "luna")
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), APP_CHAIN_STORAGE_KEY)
    )
    .toBe("luna")
})
