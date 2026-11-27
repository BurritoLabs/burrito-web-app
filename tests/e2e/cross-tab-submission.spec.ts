import { expect, test } from "@playwright/test"

test("a second tab does not submit or queue while the first awaits the wallet or an uncertain receipt", async ({ page, context, baseURL }) => {
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Local fixture only")
  const hash = "AB".repeat(32)
  let included = false
  await context.routeWebSocket(/.*/, ws => ws.close())
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url())
    if (request.method() !== "GET") return route.abort()
    if (url.origin === baseURL) {
      if (url.pathname === "/src/main.tsx") return route.fulfill({
        contentType: "text/javascript", body: 'import "/tests/e2e/fixtures/receipt-flow.tsx"'
      })
      if (!/^\/(coingecko|keybase|burrito-api)(\/|$)/.test(url.pathname)) return route.continue()
    }
    if (url.pathname.endsWith("/txs/" + hash)) return route.fulfill({
      status: included ? 200 : 404, json: included ? { tx_response: { txhash: hash, height: "12", code: 0 } } : {}
    })
    return route.abort()
  })
  const second = await context.newPage()
  await Promise.all([page.goto("/"), second.goto("/")])
  const originalStart = page.getByRole("button", { name: "Begin waiting for wallet" })
  const otherStart = second.getByRole("button", { name: "Simulate repeated taps" })
  await originalStart.click()
  await expect(page.getByLabel("Accepted intents")).toHaveText("1")
  const blocked = second.getByRole("dialog", { name: "Transaction not started" })
  await otherStart.click()
  await expect(blocked).toContainText("Another Burrito tab")
  await expect(second.getByLabel("Accepted intents")).toHaveText("0")
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:lost-response")))
  const unknown = page.getByRole("dialog", { name: "Confirmation unknown" })
  await expect(unknown).toBeVisible()
  await unknown.getByRole("button", { name: "Close for now" }).click()
  await blocked.getByRole("button", { name: "Confirm" }).click()
  await otherStart.click()
  await expect(blocked).toBeVisible()
  await expect(second.getByLabel("Accepted intents")).toHaveText("0")
  await originalStart.click()
  await expect(unknown).toBeVisible()
  included = true
  await unknown.getByRole("button", { name: "Check chain receipt" }).click()
  await expect(page.getByRole("dialog", { name: "Transaction confirmed" })).toBeVisible()
  // Releasing the lock never replays a previous tap in the other tab.
  await expect(second.getByLabel("Accepted intents")).toHaveText("0")
  await blocked.getByRole("button", { name: "Confirm" }).click()
  await otherStart.click()
  await expect(second.getByLabel("Accepted intents")).toHaveText("1")
})
