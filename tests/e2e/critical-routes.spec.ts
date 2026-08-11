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
  ["/privacy", "Privacy Policy"],
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

  const mobileBrandIcon = page.locator(
    'header a[aria-label="Go to dashboard"] img'
  )
  await expect(mobileBrandIcon).toBeVisible()
  const mobileBrandBox = await mobileBrandIcon.boundingBox()
  expect(mobileBrandBox).not.toBeNull()
  expect(Math.abs(mobileBrandBox!.x - 24)).toBeLessThan(0.5)
  expect(Math.abs(mobileBrandBox!.width - 22)).toBeLessThan(0.5)
  expect(Math.abs(mobileBrandBox!.height - 22)).toBeLessThan(0.5)

  await page.getByRole("button", { name: "Open menu" }).click()
  await expect(page.getByRole("link", { name: "NFT", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "NFT", exact: true }).click()
  await expect(page).toHaveURL(/\/nft$/)

  await page.locator('button[aria-label="Open wallet"]').click()
  const walletToggle = page.locator('button[aria-label="Toggle wallet"]')
  await expect(walletToggle).toBeVisible()
  const walletActions = ["Send", "Receive", "Buy"].map((name) =>
    page.getByRole("button", { name, exact: true })
  )
  for (const action of walletActions) {
    await expect(action).toBeVisible()
    const geometry = await action.evaluate((button) => {
      const buttonRect = button.getBoundingClientRect()
      const iconRect = button.querySelector("svg")?.getBoundingClientRect()
      return {
        width: buttonRect.width,
        height: buttonRect.height,
        buttonCenter: {
          x: buttonRect.left + buttonRect.width / 2,
          y: buttonRect.top + buttonRect.height / 2
        },
        iconCenter: iconRect
          ? {
              x: iconRect.left + iconRect.width / 2,
              y: iconRect.top + iconRect.height / 2
            }
          : undefined
      }
    })
    expect(Math.abs(geometry.width - geometry.height)).toBeLessThan(0.1)
    expect(geometry.iconCenter).toBeDefined()
    expect(
      Math.abs(geometry.buttonCenter.x - geometry.iconCenter!.x)
    ).toBeLessThan(0.1)
    expect(
      Math.abs(geometry.buttonCenter.y - geometry.iconCenter!.y)
    ).toBeLessThan(0.1)
  }
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("burritoWalletOpen")))
    .toBe("true")

  await walletToggle.click()
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("burritoWalletOpen")))
    .toBe("false")
})

test("iOS native bridge exposes and connects Burrito Wallet", async ({ page }) => {
  await selectStoredChain(page, "lunc")
  await page.addInitScript(() => {
    const bridgeCalls: string[] = []
    Object.defineProperty(window, "__burritoBridgeCalls", {
      value: bridgeCalls
    })
    Object.defineProperty(window, "BurritoNative", {
      configurable: false,
      writable: false,
      value: {
        version: 1,
        request: async (method: string) => {
          bridgeCalls.push(method)
          if (method === "bridge.getCapabilities") {
            return {
              platform: "ios",
              protocolVersion: 1,
              capabilities: {
                localWallet: true,
                transactionSigning: true,
                supportedDirectSignTypeUrls: [
                  "/cosmos.bank.v1beta1.MsgSend"
                ]
              }
            }
          }
          if (method === "wallet.getStatus") {
            return {
              exists: true,
              deviceProtectionAvailable: true
            }
          }
          if (method === "wallet.open") {
            return {
              source: "burrito",
              accounts: [
                {
                  source: "burrito",
                  chainId: "columbus-5",
                  address: "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv",
                  algorithm: "secp256k1",
                  publicKey:
                    "Aqy0vCZ9t3dGFL9gEcWZKbAGwlVDhqMJC6/ws/xBjsBE"
                },
                {
                  source: "burrito",
                  chainId: "phoenix-1",
                  address: "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv",
                  algorithm: "secp256k1",
                  publicKey:
                    "Aqy0vCZ9t3dGFL9gEcWZKbAGwlVDhqMJC6/ws/xBjsBE"
                }
              ]
            }
          }
          throw new Error(`Unexpected native method: ${method}`)
        }
      }
    })
  })

  await page.goto("/")
  await page.getByRole("button", { name: "Connect", exact: true }).first().click()
  const nativeWallet = page
    .getByRole("button")
    .filter({ hasText: "Burrito Wallet" })
  await expect(nativeWallet).toBeEnabled()
  await nativeWallet.click()

  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await expect(page.getByText("terra1...sllv", { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __burritoBridgeCalls?: string[] })
            .__burritoBridgeCalls
      )
    )
    .toEqual(["bridge.getCapabilities", "wallet.getStatus", "wallet.open"])

  const walletLabel = page.locator('span[class*="walletButtonLabel"]').first()
  await walletLabel.evaluate((element) => {
    element.textContent =
      "Burrito Validator Operations Wallet With An Intentionally Long Display Name"
  })
  const walletButton = walletLabel.locator("xpath=ancestor::button")
  const [labelStyle, buttonBox] = await Promise.all([
    walletLabel.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace
      }
    }),
    walletButton.boundingBox()
  ])
  expect(labelStyle).toEqual({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  })
  expect(buttonBox).not.toBeNull()
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth)
  )
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
