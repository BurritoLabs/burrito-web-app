import { expect, test, type Page } from "@playwright/test"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Browser plugin not available: use the existing repository Playwright workflow.
// Synthetic read-only fixtures: no live API, wallet, signer or websocket traffic.
type Scenario = { core: "healthy" | "oracle-down" | "all-down"; history: "healthy" | "all-down" | "network-down"; stakedRaw?: string }
const observations = new WeakMap<Page, { errors: string[]; console: { text: string; url: string }[]; expectedFailures: Set<string>; writes: string[] }>()

async function fixtures(page: Page, baseURL: string, scenario: Scenario) {
  const origin = new URL(baseURL).origin
  const seen = { errors: [] as string[], console: [] as { text: string; url: string }[], expectedFailures: new Set<string>(), writes: [] as string[] }
  observations.set(page, seen)
  page.on("pageerror", error => seen.errors.push(error.message))
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) seen.console.push({ text: message.text(), url: message.location().url })
  })
  await page.routeWebSocket("**/*", socket => socket.close())
  await page.route("**/*", async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
    const fail = () => { seen.expectedFailures.add(url.href); return route.fulfill({ status: 503, body: "Synthetic source unavailable" }) }
    if (!/^(GET|HEAD)$/.test(request.method())) {
      seen.expectedFailures.add(url.href)
      if (!/client-metrics|cdn-cgi\/rum/.test(path)) seen.writes.push(`${request.method()} ${url.href}`)
      return route.abort("blockedbyclient")
    }
    if (path.endsWith("/finder/prices")) return json({ lunc: { usd: 2, usd_market_cap: 200, usd_24h_change: 1 }, ustc: { usd: 1, usd_market_cap: 20 }, luna: { usd: 3 } })
    if (path.endsWith("/registry/assets")) return json({ assets: [] })
    if (path.endsWith("/market/index")) return json({ assets: [], items: [], pairs: [] })
    if (path.includes("/market/swaprate/")) return json([])
    if (url.hostname === "api.binodes.com") {
      if (scenario.history === "all-down" || (scenario.history === "network-down" && path === "/v1/network/overview")) return fail()
      const rows = [0, 1].map(index => ({ dt: `2026-11-06T0${index}:00:00Z`,
        transfer_amt_usd: 1200, active_addr_cnt: 67, tx_total_cnt: 7,
        fee_gas_usd: 0.01, fee_cp_usd: 0.02, fee_op_usd: 0.03, fee_burn_usd: 0.04,
        voluntary_burn_usd: 0.05, voluntary_burn_cnt: 2,
        staking_delegate_usd: 5, staking_undelegate_usd: 1,
        fee_burn_amt_actual: 3, fee_burn_amt_usd: 6, voluntary_burn_amt_actual: 2 }))
      return json({ code: 200, data: rows })
    }
    if (/publicnode\.com$/.test(url.hostname)) {
      if (scenario.core === "all-down") return fail()
      if (path === "/v1/dashboard") return json({ issuances: { uluna: "100000000", uusd: "20000000" }, communityPool: { uluna: "10000000", uusd: "2000000" }, stakingPool: { bondedTokens: scenario.stakedRaw ?? "30000000", stakingRatio: "0.3" } })
      if (path.endsWith("/supply/by_denom")) return json({ amount: { amount: url.searchParams.get("denom") === "uusd" ? "20000000" : "100000000" } })
      if (path.endsWith("/community_pool")) return json({ pool: [{ denom: "uluna", amount: "10000000" }, { denom: "uusd", amount: "2000000" }] })
      if (path.endsWith("/pool")) return json({ pool: { bonded_tokens: "30000000" } })
      if (path.endsWith("/params")) return json({ params: { max_validators: "130", unbonding_time: "1814400s" } })
      if (path.endsWith("/validators")) return json({ pagination: { total: "110" } })
      if (path.endsWith("/blocks/latest")) return json({ block: { header: { height: "100", time: "2026-11-06T12:00:06Z" } } })
      if (path.endsWith("/blocks/99")) return json({ block: { header: { height: "99", time: "2026-11-06T12:00:00Z" } } })
      if (path.includes("/balances/")) {
        if (scenario.core === "oracle-down" && path.includes("terra1jgp27")) return fail()
        return json({ balances: [{ denom: "uluna", amount: "4000000" }, { denom: "uusd", amount: "1000000" }] })
      }
      return json({})
    }
    if (url.hostname === "api.binance.com") return json(scenario.core === "all-down" ? [] : [0, 1].map(i => [Date.now() - (2 - i) * 3600000, "2", "2", "2", "2"]))
    if (url.hostname === "api.coinpaprika.com") return json([0, 1].map(i => ({ timestamp: new Date(Date.now() - (2 - i) * 86400000).toISOString(), price: 2 })))
    if (url.origin === origin) return route.continue()
    // Ancillary registry/social/font endpoints must not escape to the internet.
    seen.expectedFailures.add(url.href)
    return route.abort("blockedbyclient")
  })
}

const card = (page: Page, label: string) => page.locator("article").filter({ has: page.getByText(label, { exact: true }) })
const metric = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..")
async function dashboardReady(page: Page) {
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible()
  await expect(page.locator('[class*="metricSkeleton"]')).toHaveCount(0)
  await expect(card(page, "LUNC").first()).toContainText("$2")
}
async function navigation(page: Page) {
  const link = page.getByRole("link", { name: "Dashboard", exact: true })
  if (!await link.isVisible()) await page.getByRole("button", { name: "Open menu", exact: true }).click()
  await link.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible()
}

test.afterEach(async ({ page }, testInfo) => {
  if (!observations.has(page)) return
  const seen = observations.get(page)!
  expect(seen.errors, "Uncaught page errors").toEqual([])
  expect(seen.writes, "Unexpected mutating requests").toEqual([])
  const unexpected = seen.console.filter(message => !(
    (seen.expectedFailures.has(message.url) && /^Failed to load resource:/.test(message.text)) ||
    // All websockets are deliberately closed, including Vite's development HMR.
    (new URL(message.url || "http://invalid").pathname === "/@vite/client" && message.text.startsWith("[vite] failed to connect to websocket."))
  ))
  expect(unexpected, "Unexpected application console warnings/errors").toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "Viewport overflow").toBeLessThanOrEqual(1)
  await page.screenshot({ path: join(tmpdir(), `burrito-dashboard-${testInfo.project.name}-${testInfo.title.replace(/[^a-z0-9]+/gi, "-")}.png`), fullPage: true })
})

test("dashboard alias preserves query and hash, and explicit navigation opens root", async ({ page, baseURL }) => {
  await fixtures(page, baseURL!, { core: "healthy", history: "healthy" })
  await page.goto("/dashboard?source=bookmark#network")
  await expect(page).toHaveURL(/\/\?source=bookmark#network$/)
  await dashboardReady(page)
  await page.reload()
  await dashboardReady(page)
  await page.goto("/wallet")
  await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible()
  await navigation(page)
})

test("all BiNodes failures leave core usable and retry restores trends", async ({ page, baseURL }) => {
  const scenario: Scenario = { core: "healthy", history: "all-down" }
  await fixtures(page, baseURL!, scenario)
  await page.goto("/")
  await dashboardReady(page)
  await expect(page.getByRole("status").filter({ hasText: "Network trend data is temporarily unavailable" })).toBeVisible()
  for (const label of ["Transaction Volume", "Active Wallets", "Burn Activity"]) await expect(card(page, label)).toContainText("--")
  await expect(metric(page, "Total Staked")).toContainText("30")
  scenario.history = "healthy"
  await page.getByRole("button", { name: "Retry network trends", exact: true }).click()
  await expect(card(page, "Active Wallets")).toContainText("67")
  await expect(card(page, "Transaction Volume")).toContainText("$2.4K")
  await expect(page.getByRole("button", { name: "Retry network trends", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "7D", exact: true }).click()
  await expect(page.getByRole("button", { name: "7D", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(card(page, "Active Wallets")).toContainText("67")
})

test("partial network history preserves fee yield without fabricating zeros", async ({ page, baseURL }) => {
  await fixtures(page, baseURL!, { core: "healthy", history: "network-down" })
  await page.goto("/")
  await dashboardReady(page)
  await expect(page.getByRole("status").filter({ hasText: "Some network trend data is unavailable" })).toBeVisible()
  await expect(card(page, "Transaction Volume")).toContainText("--")
  await expect(card(page, "Active Wallets")).toContainText("--")
  await expect(card(page, "Fee-based Yield")).toContainText("%")
  await expect(card(page, "Fee-based Yield")).not.toContainText("Data unavailable")
  const feeValue = card(page, "Fee-based Yield").locator('[class*="trendValue"]')
  expect(await feeValue.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)), "Fee value must remain on one line").toBeLessThan(1.5)
  await expect(page.getByRole("button", { name: "Retry network trends", exact: true })).toBeEnabled()
})

test("large staked balances stay compact with accessible full precision", async ({ page, baseURL }) => {
  await fixtures(page, baseURL!, { core: "healthy", history: "healthy", stakedRaw: "800000000000000000" })
  await page.goto("/")
  await dashboardReady(page)
  const value = page.locator('[title="800,000,000,000"]')
  await expect(value).toHaveAttribute("aria-label", "800,000,000,000 LUNC")
  await expect(value).toHaveText("800BLUNC")
  expect(await value.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)), "Staked value must remain on one line").toBeLessThan(1.5)
})

test("one core source failure shows available metrics and recovers on retry", async ({ page, baseURL }) => {
  const scenario: Scenario = { core: "oracle-down", history: "healthy" }
  await fixtures(page, baseURL!, scenario)
  await page.goto("/")
  await dashboardReady(page)
  await expect(page.getByRole("status").filter({ hasText: "Some chain metrics are unavailable" })).toBeVisible()
  await expect(card(page, "Total Supply")).toContainText("100")
  await expect(card(page, "Oracle Pool")).toContainText("--")
  scenario.core = "healthy"
  await page.getByRole("button", { name: "Retry chain data", exact: true }).click()
  await expect(card(page, "Oracle Pool")).not.toContainText("--")
  await expect(page.getByRole("button", { name: "Retry chain data", exact: true })).toHaveCount(0)
})

test("all core failures settle with notice and missing values while prices remain", async ({ page, baseURL }) => {
  await fixtures(page, baseURL!, { core: "all-down", history: "healthy" })
  await page.goto("/")
  await expect(page.getByRole("status").filter({ hasText: "Chain metrics are temporarily unavailable" })).toBeVisible()
  await dashboardReady(page)
  await expect(card(page, "Total Supply")).toContainText("--")
  await expect(metric(page, "Total Staked")).toContainText("--")
  await expect(page.getByRole("img", { name: "LUNC price trend", exact: true })).toHaveCount(0)
  await expect(card(page, "LUNC").first()).toContainText("--")
  await expect(page.getByRole("button", { name: "Retry chain data", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "7D", exact: true }).click()
  await expect(page.getByRole("button", { name: "7D", exact: true })).toHaveAttribute("aria-pressed", "true")
})
