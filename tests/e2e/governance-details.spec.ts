import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { governanceFixtures, installGovernanceFixtures } from "./fixtures/governance"

const settle = async (page: Page) => {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.allSettled(document.getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished))
  })
}

for (const theme of ["light", "dark"] as const) {
  for (const chain of ["lunc", "luna"] as const) {
    for (const fixture of governanceFixtures) {
      test(`${theme} ${chain} ${fixture.label} populated proposal details are readable`, async ({ page }, testInfo) => {
        const pageErrors: string[] = []
        page.on("pageerror", (error) => pageErrors.push(error.message))
        await installGovernanceFixtures(page)
        await page.goto(`/gov?tab=${fixture.tab}`)
        if (chain === "luna") {
          await page.getByRole("button", { name: "Switch network", exact: true }).click()
          await page.getByRole("menuitem").filter({ hasText: "LUNA" }).click()
        }
        await expect(page.locator("html")).toHaveAttribute("data-app-chain", chain)
        await page.locator(`a[href="/proposal/${fixture.proposal.id}"]`).filter({ hasText: fixture.proposal.title }).click()
        await expect(page).toHaveURL(new RegExp(`/proposal/${fixture.proposal.id}$`))
        await expect(page).toHaveTitle(/Burrito/)
        await expect(page.getByRole("heading", { name: "Proposal details", exact: true })).toBeVisible()
        await expect(page.getByRole("heading", { name: fixture.proposal.title, exact: true })).toBeVisible()
        const percentages = page.locator('[class*="voteItemRatio"]')
        await expect(percentages).toHaveCount(4)
        for (const percentage of await percentages.all()) await expect(percentage).toBeVisible()
        // Wait for the fixture tally, not the initial zero/loading presentation.
        await expect(page.locator('[class*="voteItemRatio"]').first()).toHaveText("100.00%")
        if (await page.locator("html").getAttribute("data-theme") !== theme) {
          await page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true }).click()
        }
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
        for (const expanded of [false, true]) {
          if (expanded) {
            await page.getByRole("button", { name: "Show details", exact: true }).click()
            await expect(page.getByText(fixture.proposal.summary, { exact: true })).toBeVisible()
            await expect(page.getByRole("button", { name: "Hide details", exact: true })).toBeVisible()
          }
          await settle(page)
          const accessibility = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .exclude('[aria-hidden="true"]')
            .analyze()
          await testInfo.attach(`accessibility-${expanded ? "expanded" : "collapsed"}`, {
            body: Buffer.from(JSON.stringify({ violations: accessibility.violations, incomplete: accessibility.incomplete })),
            contentType: "application/json"
          })
          expect(accessibility.violations).toEqual([])
          // Full-page Axe retains manual-review items (e.g. overlapping sticky
          // chrome); never treat those as passes. The four changed text values
          // additionally need a completely measurable, scoped contrast result.
          const ratios = await new AxeBuilder({ page })
            .include('[class*="voteItemRatio"]')
            .withRules(["color-contrast"])
            .analyze()
          expect(ratios.violations).toEqual([])
          expect(ratios.incomplete, "All four vote percentages must be measurable").toEqual([])
          expect(ratios.passes.find((item) => item.id === "color-contrast")?.nodes,
            "All four vote percentages must actually enter the contrast check").toHaveLength(4)
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
        }
        if (fixture.label === "Voting") {
          await page.evaluate(() => window.scrollTo(0, 0))
          await testInfo.attach(`${testInfo.project.name}-${theme}-${chain}-details`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" })
        }
        await page.getByRole("button", { name: "Hide details", exact: true }).click()
        await expect(page.getByText(fixture.proposal.summary, { exact: true })).toBeHidden()
        await expect(page.locator("vite-error-overlay")).toHaveCount(0)
        expect(pageErrors).toEqual([])
      })
    }
  }
}
