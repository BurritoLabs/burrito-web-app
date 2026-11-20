import { expect, test } from "@playwright/test"
import { installGovernanceFixtures } from "./fixtures/governance"

for (const width of [320, 390, 430, 470]) {
  test(`mobile governance fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await installGovernanceFixtures(page)
    await page.goto("/gov")
    const shell = page.locator("[data-page-shell]")
    const proposal = shell.locator('a[href="/proposal/99001"]').filter({ hasText: "QA Voting proposal" })
    const action = shell.getByRole("link", { name: "New proposal" })
    await expect(proposal).toBeVisible()

    const fits = async (target: typeof shell) => {
      const rect = await target.boundingBox()
      expect(rect).not.toBeNull()
      expect(rect!.x).toBeGreaterThanOrEqual(0)
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1)
    }

    for (const label of ["Voting", "Deposit", "Passed", "Rejected"]) {
      const tab = shell.getByRole("button", { name: label, exact: true })
      await fits(tab)
    }
    await fits(proposal)
    await fits(proposal.getByText(/%/).first())
    await fits(action)
    const wallet = page.getByRole("button", { name: "Open wallet", exact: true })
    await expect(wallet).toBeVisible()
    const rail = await wallet.boundingBox()
    expect(rail!.x + rail!.width).toBeGreaterThanOrEqual(width - 1)
    await action.click({ trial: true })
    await shell.getByRole("button", { name: "Rejected", exact: true }).click()
    await expect(shell.getByText("QA Rejected proposal")).toBeVisible()
  })
}

for (const [route, heading] of [
  ["/wallet", "Wallet"],
  ["/market", "Market"],
  ["/swap", "Swap"],
  ["/stake", "Stake"],
  ["/launchpad", "Launchpad"],
  ["/history", "History"],
  ["/nft", "NFT"],
  ["/contract", "Contract"],
  ["/proposal/new", "New proposal"],
  ["/proposal/99001", "Proposal details"]
]) {
  test(`mobile ${route} keeps shared header within the viewport and preserves Wallet`, async ({ page }) => {
    const width = 390
    await page.setViewportSize({ width, height: 844 })
    if (route.startsWith("/proposal/")) await installGovernanceFixtures(page)
    await page.goto(route)
    const shell = page.locator("[data-page-shell]")
    await expect(shell.getByRole("heading", { name: heading, exact: true })).toBeVisible()
    const rect = await shell.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::header[1]").boundingBox()
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(391)
    const wallet = page.getByRole("button", { name: "Open wallet", exact: true })
    await expect(wallet).toBeVisible()
    const rail = await wallet.boundingBox()
    expect(rail!.x + rail!.width).toBeGreaterThanOrEqual(width - 1)
  })
}
