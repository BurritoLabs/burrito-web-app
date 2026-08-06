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
  ["/nft", "NFT"],
  ["/contract", "Contract"],
  ["/proposal/new", "New proposal"],
  ["/proposal/1", "Proposal details"],
  ["/rewards", "Withdraw rewards"],
  ["/commission", "Withdraw commission"],
  ["/audit-not-found", "404"]
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

test("closed wallet handle does not cover page actions", async ({ page }) => {
  await selectStoredChain(page, "lunc")
  await page.setViewportSize({ width: 320, height: 812 })
  const cases = [
    ["/", "7d"],
    ["/stake", "Withdraw all rewards"],
    ["/gov", "New proposal"],
    ["/contract", "Instantiate"]
  ] as const

  for (const [path, actionName] of cases) {
    await page.goto(path)
    const walletHandle = page.locator('button[aria-label="Open wallet"]')
    const action = page
      .getByRole("button", { name: actionName, exact: true })
      .or(page.getByRole("link", { name: actionName, exact: true }))
    await expect(walletHandle).toBeVisible()
    await expect(action).toBeVisible()

    const [walletBox, actionBox] = await Promise.all([
      walletHandle.boundingBox(),
      action.boundingBox()
    ])
    expect(walletBox).not.toBeNull()
    expect(actionBox).not.toBeNull()

    const overlaps =
      walletBox!.x < actionBox!.x + actionBox!.width &&
      walletBox!.x + walletBox!.width > actionBox!.x &&
      walletBox!.y < actionBox!.y + actionBox!.height &&
      walletBox!.y + walletBox!.height > actionBox!.y
    expect(overlaps, `${path} wallet handle overlaps ${actionName}`).toBe(false)
  }
})

test("mobile navigation and wallet panel remain operable", async ({ page }) => {
  await selectStoredChain(page, "lunc")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")

  await page.getByRole("button", { name: "Open menu" }).click()
  await expect(page.getByRole("link", { name: "NFT", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "NFT", exact: true }).click()
  await expect(page).toHaveURL(/\/nft$/)

  await page.locator('button[aria-label="Open wallet"]').click()
  const walletToggle = page.locator('button[aria-label="Toggle wallet"]')
  await expect(walletToggle).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("burritoWalletOpen")))
    .toBe("true")

  await walletToggle.click()
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("burritoWalletOpen")))
    .toBe("false")
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
