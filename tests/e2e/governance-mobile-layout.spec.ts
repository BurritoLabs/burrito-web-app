import { expect, test, type Locator, type Page } from "@playwright/test"
import { installGovernanceFixtures } from "./fixtures/governance"

const bounds = async (target: Locator) => {
  await expect(target).toBeVisible()
  const rect = await target.boundingBox()
  if (!rect) throw new Error("Missing layout bounds")
  return rect
}

const fitsBeforeWallet = async (target: Locator, railLeft: number) => {
  const rect = await bounds(target)
  expect(rect.x).toBeGreaterThanOrEqual(0)
  expect(rect.x + rect.width).toBeLessThanOrEqual(railLeft - 3)
}

const closedWalletGeometry = async (page: Page, width: number) => {
  const handle = page.getByRole("button", { name: "Open wallet", exact: true })
  const rail = await bounds(handle)
  const header = await bounds(page.getByRole("banner"))
  // The wallet's existing one-pixel tray border can put the handle's
  // outer right edge one pixel beyond the viewport; don't relocate it.
  expect(Math.abs(rail.x + rail.width - width)).toBeLessThanOrEqual(1.25)
  expect(rail.y - (header.y + header.height)).toBeCloseTo(10, 0)
  if (width <= 420) {
    expect(rail.width).toBe(24)
    expect(rail.height).toBe(44)
  }
  return rail
}

for (const width of [320, 390, 420, 421, 430, 470, 768]) {
  test(`mobile governance fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await installGovernanceFixtures(page)
    await page.goto("/gov")
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const shell = page.locator("[data-page-shell]")
    const proposal = shell.locator('a[href="/proposal/99001"]').filter({ hasText: "QA Voting proposal" })
    const action = shell.getByRole("link", { name: "New proposal" })
    const rail = await closedWalletGeometry(page, width)

    for (const label of ["Voting", "Deposit", "Passed", "Rejected"]) {
      const tab = shell.getByRole("button", { name: label, exact: true })
      await fitsBeforeWallet(tab, rail.x)
      expect(await tab.evaluate((button) => {
        const text = button.querySelector("span")
        if (!text) return 0
        const range = document.createRange()
        range.selectNodeContents(text)
        return range.getClientRects().length
      })).toBe(1)
    }
    if (width === 320) {
      const voting = await bounds(shell.getByRole("button", { name: "Voting", exact: true }))
      const passed = await bounds(shell.getByRole("button", { name: "Passed", exact: true }))
      expect(passed.x).toBeCloseTo(voting.x, 0)
      expect(passed.y).toBeGreaterThanOrEqual(voting.y + voting.height - 1)
    }
    await fitsBeforeWallet(proposal, rail.x)
    await fitsBeforeWallet(proposal.getByText(/%/).first(), rail.x)
    await fitsBeforeWallet(action, rail.x)
    const edgeHit = await action.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(rect.right - 3, rect.top + rect.height / 2))
    })
    expect(edgeHit).toBe(true)
    await action.click({ trial: true })
    await shell.getByRole("button", { name: "Rejected", exact: true }).click()
    await expect(shell.getByText("QA Rejected proposal")).toBeVisible()
  })
}

for (const [route, heading] of [
  ["/", "Dashboard"],
  ["/dashboard", "Dashboard"],
  ["/wallet", "Wallet"],
  ["/market", "Market"],
  ["/swap", "Swap"],
  ["/stake", "Stake"],
  ["/launchpad", "Launchpad"],
  ["/history", "History"],
  ["/nft", "NFT"],
  ["/contract", "Contract"],
  ["/rewards", "Withdraw rewards"],
  ["/commission", "Withdraw commission"],
  ["/privacy", "Privacy Policy"],
  ["/missing-portrait-route", "404"],
  ["/proposal/new", "New proposal"],
  ["/proposal/99001", "Proposal details"]
]) {
  test(`mobile ${route} keeps shared content clear of the fixed Wallet`, async ({ page }) => {
    const width = 320
    await page.setViewportSize({ width, height: 844 })
    if (route.startsWith("/proposal/")) await installGovernanceFixtures(page)
    await page.goto(route)
    const shell = page.locator("[data-page-shell]")
    await expect(shell.getByRole("heading", { name: heading, exact: true })).toBeVisible()
    const rail = await closedWalletGeometry(page, width)
    await fitsBeforeWallet(shell.locator("header").first(), rail.x)
    const content = shell.locator("header + div").first()
    await fitsBeforeWallet(content, rail.x)
    const rect = await bounds(content)
    expect(Math.abs(2 * rect.x + rect.width - width)).toBeLessThanOrEqual(1)
    for (const section of await content.locator(":scope > *").all()) {
      if (await section.isVisible()) await fitsBeforeWallet(section, rail.x)
    }
  })
}

test("mobile market pair centers its chart and overview outside the Wallet strip", async ({ page }) => {
  const pair = "terra1m6ywlgn6wrjuagcmmezzz2a029gtldhey5k552"
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/market/pair/astroport/${pair}`)
  const overview = page.getByRole("region", { name: "Pair overview" })
  const rail = await closedWalletGeometry(page, 320)
  await fitsBeforeWallet(overview, rail.x)
  await fitsBeforeWallet(page.getByRole("region", { name: "Price chart" }), rail.x)
  const rect = await bounds(overview)
  expect(Math.abs(2 * rect.x + rect.width - 320)).toBeLessThanOrEqual(1)
})

test("mobile Market keeps a populated card and rank inside the page with a fallback token name", async ({ page }) => {
  const pair = "terra1lc4t00z4kgpjtny0q2asxy8gfqwvjkjcwuzz54thnxsj2n9hla8qg2kamm"
  const token = "terra15juucad3k2npsj53crl6qhra9f65s9jkas9nzpqypj38en4ht32qczde4a"
  await page.setViewportSize({ width: 320, height: 844 })
  await page.route(/\/market\/index(?:\.json)?(?:\?|$)/, (route) => route.fulfill({
    json: {
      chainId: "columbus-5",
      generatedAt: "2026-11-20T12:00:00Z",
      pairs: [{
        pair, dexId: "garuda-v2", dexLabel: "Garuda DeFi V2", type: "xyk",
        assets: [token, "uluna"],
        poolAssets: [
          { id: `cw20:${token}`, amount: "5860115640897322" },
          { id: "native:uluna", amount: "23498612015866" }
        ]
      }]
    }
  }))
  await page.route(/\/cosmwasm\/wasm\/v1\/contract\/[^/]+\/smart\//, (route) =>
    route.fulfill({ status: 503, json: {} }))
  await page.goto("/market")
  const rail = await closedWalletGeometry(page, 320)
  const card = page.locator(`a[href="/market/pair/garuda-v2/${pair}"]`)
  await expect(card.getByText(/terra1.*de4a/)).toBeVisible()
  await fitsBeforeWallet(card, rail.x)
  const rank = await bounds(card.getByText("#1", { exact: true }))
  const frame = await bounds(card)
  expect(rank.x + rank.width).toBeLessThanOrEqual(frame.x + frame.width - 4)
})

test("mobile voting detail wraps long chain text and the deposit dialog is usable", async ({ page }) => {
  const width = 320
  const summary = "Discussion: https://example.com/" + "UnbrokenProposalDetails".repeat(10)
  await page.setViewportSize({ width, height: 640 })
  await installGovernanceFixtures(page, summary)
  await page.goto("/proposal/99001")
  const rail = await closedWalletGeometry(page, width)
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeDisabled()
  await fitsBeforeWallet(page.getByRole("heading", { name: /^QA LongTitle/ }), rail.x)
  await page.getByRole("button", { name: "Show details", exact: true }).click()
  const description = page.getByText(summary, { exact: true })
  await fitsBeforeWallet(description, rail.x)
  expect(await description.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

  await page.goto("/gov")
  await page.getByRole("button", { name: "Deposit", exact: true }).click()
  await page.getByRole("link", { name: "Deposit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Deposit to proposal" })
  const close = dialog.getByRole("button", { name: "Close deposit modal" })
  await expect(close).toBeVisible()
  await close.click()
  await expect(dialog).toHaveCount(0)
})

test("mobile Wallet handle keeps its edge anchor on scroll and after closing the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 640 })
  await installGovernanceFixtures(page)
  await page.goto("/gov")
  const handle = page.getByRole("button", { name: "Open wallet", exact: true })
  const rail = await closedWalletGeometry(page, 430)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const scrolled = await closedWalletGeometry(page, 430)
  expect(scrolled.y).toBe(rail.y)
  expect(scrolled.x + scrolled.width).toBeCloseTo(rail.x + rail.width, 0)
  await handle.click()
  const toggle = page.getByRole("button", { name: "Toggle wallet", exact: true })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect.poll(async () => {
    const closed = await bounds(toggle)
    return Math.abs(closed.x + closed.width - 430)
  }).toBeLessThanOrEqual(1.25)
  const closed = await bounds(toggle)
  expect(closed.y).toBe(rail.y)
  // Lazy and fully loaded handles can have slightly different label metrics.
  // The fixed anchor and a clickable page action are the layout contract.
  await fitsBeforeWallet(page.getByRole("link", { name: "New proposal" }), closed.x)
  await page.getByRole("link", { name: "New proposal" }).click({ trial: true })
})
