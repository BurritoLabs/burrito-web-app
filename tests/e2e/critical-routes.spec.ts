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

test("wallet recovers from a full local asset cache", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    const cacheKey = "cw20balance-single:v1:wallet:columbus-5:token"
    const originalSetItem = Storage.prototype.setItem
    originalSetItem.call(window.localStorage, cacheKey, "cached")
    originalSetItem.call(window.localStorage, "burritoWalletConnector", "keplr")

    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (
        key === "burritoHiddenTokens:columbus-5" &&
        window.localStorage.getItem(cacheKey)
      ) {
        throw new DOMException("Quota exceeded", "QuotaExceededError")
      }
      originalSetItem.call(this, key, value)
    }
  })

  await page.goto("/wallet")

  await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem(
          "cw20balance-single:v1:wallet:columbus-5:token"
        )
      )
    )
    .toBeNull()
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("burritoWalletConnector"))
    )
    .toBe("keplr")
  expect(pageErrors).toEqual([])
})

test("stored mobile wallet session cannot crash the app shell", async ({
  page
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("burritoWalletConnector", "keplr-mobile")
    window.localStorage.setItem(
      "cosmos-kit@2:core//current-wallet",
      "keplr-mobile"
    )
  })

  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true })
  ).toBeVisible()
})

test("mobile wallet runtime failure degrades to a disconnected app", async ({
  page
}) => {
  await page.route(
    "**/src/app/wallet/WalletRuntimeProvider.tsx*",
    (route) => route.abort()
  )
  await page.addInitScript(() => {
    window.localStorage.setItem("burritoWalletConnector", "keplr-mobile")
  })

  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Connect", exact: true })
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("burritoWalletConnector")
      )
    )
    .toBeNull()
})

test("wallet CW20 deep links prioritize the requested swap asset", async ({
  page
}) => {
  const contract =
    "terra1dut9t6cglr2ns2gherm7dtwk3u05xtz0gqan8a7j0ehtkqkdefws7g20e4"
  let requestedContracts: string[] = []
  await page.route("**/__registry-test/v1/finder/account-assets", async (route) => {
    const body = route.request().postDataJSON() as { contracts?: string[] }
    const bodyContracts = body.contracts ?? []
    if (!requestedContracts.length && bodyContracts.includes(contract)) {
      requestedContracts = bodyContracts
    }
    if (bodyContracts.includes(contract)) {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        cw20: bodyContracts.includes(contract)
          ? [
              {
                contract,
                status: "ok",
                metadata: {
                  name: "Burrito Test",
                  symbol: "BTEST",
                  decimals: 6
                }
              }
            ]
          : [],
        ibc: []
      })
    })
  })

  await page.goto(
    `/swap?from=${encodeURIComponent(`cw20:${contract}`)}&to=native%3Auluna`
  )

  await expect(
    page.getByRole("button", { name: /^BTEST BTEST/ })
  ).toBeVisible({ timeout: 20_000 })
  expect(requestedContracts[0]).toBe(contract)
})
