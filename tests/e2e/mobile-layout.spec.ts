import { expect, test } from "@playwright/test"

const getHeaderMetrics = async (page: import("@playwright/test").Page) =>
  page.getByRole("banner").evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      position: style.position,
      zIndex: Number(style.zIndex) || 0
    }
  })

test("mobile market keeps the fixed header above content and covers the bottom", async ({
  page
}) => {
  await page.goto("/market")

  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Market" })).toBeVisible()
  const networkSwitcher = page.getByRole("button", { name: "Switch network" })
  await expect(networkSwitcher).toBeVisible()
  await expect(networkSwitcher).toHaveCSS("width", "50px")
  await expect(networkSwitcher.getByText("LUNC", { exact: true })).toBeHidden()
  await expect(async () => {
    if (!(await page.getByRole("dialog").isVisible())) {
      await page.getByRole("button", { name: "Connect" }).click()
    }
    await expect(page.getByRole("button", { name: /Keplr Mobile/ })).toBeEnabled({
      timeout: 1000
    })
  }).toPass({ timeout: 15_000 })
  await page.getByRole("button", { name: "Close" }).click()

  const header = await getHeaderMetrics(page)
  expect(header.position).toBe("fixed")
  expect(header.zIndex).toBeGreaterThanOrEqual(500)
  expect(header.top).toBeGreaterThanOrEqual(0)
  expect(header.top).toBeLessThan(2)
  expect(header.height).toBeGreaterThan(56)

  const mainTop = await page.locator("main").evaluate((element) => {
    return element.getBoundingClientRect().top
  })
  expect(mainTop).toBeGreaterThanOrEqual(header.bottom - 1)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(250)

  const scrolledHeader = await getHeaderMetrics(page)
  expect(scrolledHeader.position).toBe("fixed")
  expect(scrolledHeader.top).toBeGreaterThanOrEqual(0)
  expect(scrolledHeader.top).toBeLessThan(2)

  const bottomHit = await page.evaluate(() => {
    const element = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      window.innerHeight - 2
    )
    const chain: Array<{ tag: string; className: string; background: string }> = []
    let current = element instanceof HTMLElement ? element : null

    while (current && chain.length < 5) {
      chain.push({
        tag: current.tagName,
        className: String(current.className),
        background: window.getComputedStyle(current).backgroundColor
      })
      current = current.parentElement
    }

    return chain
  })

  expect(bottomHit.length).toBeGreaterThan(0)
  expect(bottomHit[0].tag).not.toBe("HTML")
  expect(
    bottomHit.some((item) =>
      /pageArea|main|layout|market|pool|card/i.test(item.className)
    )
  ).toBe(true)

  const backgrounds = await page.evaluate(() => ({
    html: window.getComputedStyle(document.documentElement).backgroundColor,
    body: window.getComputedStyle(document.body).backgroundColor
  }))
  expect(backgrounds.html).not.toBe("rgba(0, 0, 0, 0)")
  expect(backgrounds.body).not.toBe("rgba(0, 0, 0, 0)")
})

test("mobile Connect starts the Keplr Mobile handoff", async ({ page }) => {
  const walletRuntimeErrors: string[] = []
  page.on("console", (message) => {
    if (message.text().includes("walletModal")) {
      walletRuntimeErrors.push(message.text())
    }
  })
  await page.addInitScript(() => {
    const walletWindow = window as Window & {
      __burritoWalletWrites?: Array<{ key: string; value: string }>
    }
    const originalSetItem = Storage.prototype.setItem
    walletWindow.__burritoWalletWrites = []
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (
        key === "burritoWalletConnector" ||
        key === "cosmos-kit@2:core//current-wallet"
      ) {
        walletWindow.__burritoWalletWrites?.push({ key, value })
      }
      originalSetItem.call(this, key, value)
    }
  })
  await page.goto("/")

  await page.getByRole("button", { name: "Connect", exact: true }).click()
  const mobileConnector = page.getByRole("button", { name: /Keplr Mobile/ })
  await expect(mobileConnector).toBeEnabled()

  await mobileConnector.click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const walletWindow = window as Window & {
          __burritoWalletWrites?: Array<{ key: string; value: string }>
        }
        return walletWindow.__burritoWalletWrites ?? []
      })
    )
    .toEqual(
      expect.arrayContaining([
        { key: "burritoWalletConnector", value: "keplr-mobile" },
        {
          key: "cosmos-kit@2:core//current-wallet",
          value: "keplr-mobile"
        }
      ])
    )
  expect(walletRuntimeErrors).toEqual([])
})
