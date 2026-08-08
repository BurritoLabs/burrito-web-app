import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

const routes = [
  ["/", "Dashboard"],
  ["/market", "Market"],
  ["/stake", "Stake"],
  ["/gov", "Governance"],
  ["/launchpad", "Launchpad"],
  ["/contract", "Contract"]
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
}

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
