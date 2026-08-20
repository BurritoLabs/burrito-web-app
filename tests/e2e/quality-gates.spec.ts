import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

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
  ["/privacy", "Privacy Policy"]
] as const

const themes = ["light", "dark"] as const

const setTheme = async (page: Page, theme: (typeof themes)[number]) => {
  const current = await page.locator("html").getAttribute("data-theme")
  if (current === theme) return
  await page
    .getByRole("button", {
      name: theme === "dark" ? "Switch to dark theme" : "Switch to light theme"
    })
    .click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
}

const expectDialogSurface = async (page: Page) => {
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  const surface = dialog.locator(":scope > div, :scope > section").first()
  const metrics = await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return {
      background: style.backgroundColor,
      color: style.color,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    }
  })
  expect(metrics.background).not.toBe("rgba(0, 0, 0, 0)")
  expect(metrics.color).not.toBe("rgba(0, 0, 0, 0)")
  expect(metrics.left).toBeGreaterThanOrEqual(0)
  expect(metrics.top).toBeGreaterThanOrEqual(0)
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1)
}

const getVisibleHeaderControls = (page: Page) =>
  page.getByRole("banner").locator("button:visible").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        name: button.getAttribute("aria-label") || button.textContent?.trim() || "button",
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      }
    })
  )

type HeaderControl = Awaited<ReturnType<typeof getVisibleHeaderControls>>[number]

const overlapArea = (left: HeaderControl, right: HeaderControl) =>
  Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
  Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))

for (const theme of themes) {
  test(`${theme} theme passes representative visual and accessibility gates`, async ({
    page
  }, testInfo) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    for (const [path, heading] of routes) {
      await page.goto(path)
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
      await setTheme(page, theme)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, `${theme} ${path} horizontal overflow`).toBeLessThanOrEqual(1)

      const controls = await getVisibleHeaderControls(page)
      for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
          expect(
            overlapArea(controls[leftIndex], controls[rightIndex]),
            `${theme} ${path}: ${controls[leftIndex].name} overlaps ${controls[rightIndex].name}`
          ).toBe(0)
        }
      }

      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        // Decorative text is duplicated by the button's accessible name. Axe's
        // contrast sampler misreads its transformed, partially off-canvas pixels.
        .exclude('[aria-hidden="true"]')
        .analyze()
      const blockingViolations = accessibility.violations.filter(
        (violation) => violation.impact === "critical" || violation.impact === "serious"
      )
      expect(
        blockingViolations,
        `${theme} ${path} accessibility violations: ${blockingViolations
          .map((violation) => violation.id)
          .join(", ")}`
      ).toEqual([])

      if (["/", "/stake", "/gov", "/launchpad"].includes(path)) {
        await testInfo.attach(
          `${testInfo.project.name}-${theme}-${heading.toLowerCase().replaceAll(" ", "-")}`,
          {
            body: await page.screenshot({ animations: "disabled", fullPage: false }),
            contentType: "image/png"
          }
        )
      }
    }

    expect(pageErrors).toEqual([])
  })

  test(`${theme} theme keeps public dialogs readable and inside the viewport`, async ({
    page
  }) => {
    await page.goto("/")
    await setTheme(page, theme)
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expectDialogSurface(page)
    await page.getByRole("button", { name: "Close" }).click()

    await page.goto("/swap")
    await setTheme(page, theme)
    await page.locator("main button").filter({ hasText: /LUNC|LUNA/ }).first().click()
    await expect(page.getByRole("heading", { name: "Select token" })).toBeVisible()
    await expectDialogSurface(page)
    await page.getByRole("button", { name: "Close" }).click()
  })
}

test("market cards keep a loaded local fallback under remote asset logos", async ({
  page
}) => {
  await page.goto("/market")
  await expect(page.getByRole("heading", { name: "Market" })).toBeVisible()
  const fallbacks = page.locator('main article img[alt=""]')
  await expect(fallbacks.first()).toBeVisible()
  const fallbackState = await fallbacks.evaluateAll((images) =>
    images.map((image) => ({
      loaded: image instanceof HTMLImageElement && image.naturalWidth > 0,
      src: image.getAttribute("src") ?? ""
    }))
  )
  expect(fallbackState.length).toBeGreaterThan(0)
  expect(fallbackState.every((image) => image.src.startsWith("/system/"))).toBe(true)
  expect(fallbackState.every((image) => image.loaded)).toBe(true)
})

test("mobile wallet runtime stays deferred until the connect flow begins", async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile interaction only")
  await page.goto("/")

  const walletRuntimeResources = () =>
    page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /WalletRuntimeProvider/i.test(name))
    )

  expect(await walletRuntimeResources()).toEqual([])
  await page.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(page.getByRole("button", { name: /Keplr Mobile/ })).toBeEnabled()
  await expect.poll(walletRuntimeResources).not.toEqual([])
})
