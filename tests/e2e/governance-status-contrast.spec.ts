import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { governanceFixtures, installGovernanceFixtures } from "./fixtures/governance"

const settleTheme = async (page: Page, theme: "light" | "dark") => {
  if (await page.locator("html").getAttribute("data-theme") !== theme) {
    await page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true }).click()
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.allSettled(document.getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished))
  })
}

for (const theme of ["light", "dark"] as const) {
  for (const chain of ["lunc", "luna"] as const) {
    test(`${theme} ${chain} populated governance status labels stay readable`, async ({ page }, testInfo) => {
      const pageErrors: string[] = []
      page.on("pageerror", (error) => pageErrors.push(error.message))
      await installGovernanceFixtures(page)
      await page.goto("/gov")
      await expect(page.getByRole("heading", { name: "Governance", exact: true })).toBeVisible()
      if (chain === "luna") {
        await page.getByRole("button", { name: "Switch network", exact: true }).click()
        await page.getByRole("menuitem").filter({ hasText: "LUNA" }).click()
      }
      await expect(page.locator("html")).toHaveAttribute("data-app-chain", chain)

      for (const fixture of governanceFixtures) {
        await page.goto(`/gov?tab=${fixture.tab}`)
        await expect(page.getByRole("heading", { name: "Governance", exact: true })).toBeVisible()
        const proposalLink = page.locator(`a[href="/proposal/${fixture.proposal.id}"]`).filter({ hasText: fixture.proposal.title })
        await expect(proposalLink).toBeVisible()
        for (const surface of ["list", "details"]) {
          if (surface === "details") {
            await proposalLink.click()
            await expect(page.getByRole("heading", { name: "Proposal details", exact: true })).toBeVisible()
          }
          const pill = page.locator('[class*="statusPill"]').filter({ hasText: new RegExp(`^${fixture.label}$`) })
          await expect(pill).toHaveCount(1)
          await expect(pill).toBeVisible()
          await pill.scrollIntoViewIfNeeded()
          await settleTheme(page, theme)
          const accessibility = await new AxeBuilder({ page })
            .include('[class*="statusPill"]')
            .withRules(["color-contrast"])
            .analyze()
          expect(accessibility.incomplete, `${theme} ${chain} ${fixture.label} ${surface}: contrast must be measurable`).toEqual([])
          expect(accessibility.violations, `${theme} ${chain} ${fixture.label} ${surface}: status contrast`).toEqual([])
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
          if (fixture.label === "Voting") {
            await testInfo.attach(`${theme}-${chain}-voting-${surface}`, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" })
          }
        }
      }
      expect(pageErrors).toEqual([])
    })
  }
}
