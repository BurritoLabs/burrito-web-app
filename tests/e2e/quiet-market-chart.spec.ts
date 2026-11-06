import { expect, test, type Page } from "@playwright/test"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Browser plugin not available. Use existing Playwright, no new dependencies.
// The real chart panel is mounted in a component-only fixture with synthetic
// observations; this does not certify the live collector or chart renderer.
const mount = async (page: Page, baseURL: string | undefined, suffix = "") => {
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Local test server required")
  const origin = new URL(baseURL).origin
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!/^(GET|HEAD)$/.test(request.method())) return route.abort("blockedbyclient")
    if (url.origin === origin && ["document", "script", "stylesheet", "image", "font"].includes(request.resourceType())) return route.continue()
    return route.fulfill({ contentType: "application/json", body: "{}" })
  })
  await page.route(/\/src\/main\.tsx(?:\?|$)/, (route) => route.fulfill({
    contentType: "text/javascript", body: 'import "/tests/e2e/fixtures/quiet-market-chart.tsx";'
  }))
  await page.goto(`/market${suffix}`)
  await expect(page).toHaveTitle("Quiet market chart QA fixture")
  await expect(page.getByRole("heading", { name: "Quiet market chart QA fixture" })).toBeVisible()
  await expect(page.locator("vite-error-overlay")).toHaveCount(0)
}

test("quiet one-hour range explains known observations and widens on explicit action", async ({ page, baseURL }, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text())
  })
  await mount(page, baseURL)
  const chart = page.getByRole("region", { name: "Price chart" })
  await expect(chart).toContainText("No observed swaps in this 1h range.")
  await expect(chart).toContainText("Latest observed swap:")
  await expect(chart.locator("time")).toHaveAttribute("datetime", "2026-11-05T22:08:21.000Z")
  await expect(chart.getByRole("group", { name: "LUNC/USTC 1h price chart", exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
      document.documentElement.style.colorScheme = value
    }, theme)
    await expect(chart.getByRole("button", { name: "View 24h history", exact: true })).toBeVisible()
    await page.screenshot({ path: join(tmpdir(), `burrito-quiet-chart-${testInfo.project.name}-${theme}-nov06.png`) })
  }
  await chart.getByRole("button", { name: "View 24h history", exact: true }).click()
  await expect(chart.getByRole("button", { name: "24h", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(chart.getByRole("group", { name: "LUNC/USTC 24h price chart", exact: true })).toBeVisible()
  await expect(chart.getByRole("group", { name: "Selected candle values" })).toContainText("0.00997")
  await expect(chart).not.toContainText("No observed swaps")
  expect(errors).toEqual([])
})

test("unknown observations and failed sources do not claim a last trade or quiet activity", async ({ page, baseURL }) => {
  await mount(page, baseURL, "?unknown=1")
  await expect(page.getByRole("region", { name: "Price chart" })).not.toContainText("Latest observed swap")
  await page.getByRole("button", { name: "24h", exact: true }).click()
  await expect(page.getByRole("button", { name: "24h", exact: true })).toHaveAttribute("aria-pressed", "true")
  await page.goto("/market?failed=1")
  const chart = page.getByRole("region", { name: "Price chart" })
  await expect(chart.getByRole("alert")).toContainText("Could not load the price chart.")
  await expect(chart.getByRole("button", { name: "Try again", exact: true })).toBeVisible()
  await expect(chart).not.toContainText("No observed swaps")
  await expect(chart).not.toContainText("Latest observed swap")
})
