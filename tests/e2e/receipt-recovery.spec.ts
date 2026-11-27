import { expect, test } from "@playwright/test"

test("uncertain receipt survives dismiss and refresh, blocks a second intent and only checks the original chain", async ({page, baseURL}) => {
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Local fixture required")
  const hash = "AB".repeat(32)
  const reads: string[] = []
  const writes: string[] = []
  let included = false
  await page.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === baseURL) {
      if (url.pathname === "/src/main.tsx") return route.fulfill({contentType:"text/javascript", body:'import "/tests/e2e/fixtures/receipt-flow.tsx"'})
      return route.continue()
    }
    if (req.method() !== "GET") writes.push(req.method())
    if (url.pathname.endsWith("/txs/" + hash)) {
      reads.push(url.hostname)
      return route.fulfill({status: included ? 200 : 404, json: included ?
        {tx_response: { txhash: hash, height:"123", code:0 }} : {} })
    }
    return route.fulfill({ json:{} })
  })
  await page.goto("/")
  const submit = page.getByRole("button", {name:"Simulate repeated taps"})
  await submit.click()
  const dialog = page.getByRole("dialog", {name:"Confirmation unknown"})
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("link")).toHaveAttribute("href", "https://finder.burrito.money/mainnet/tx/" + hash)
  await expect(page.getByLabel("Accepted intents")).toHaveText("1")
  await dialog.getByRole("button", {name:"Close for now"}).click()
  await submit.click()
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel("Accepted intents")).toHaveText("1")
  await page.reload()
  await expect(dialog).toBeVisible()
  await expect.poll(() => reads.length).toBeGreaterThanOrEqual(4)
  included = true
  await dialog.getByRole("button", {name:"Check chain receipt"}).click()
  await expect(page.getByRole("dialog", {name:"Transaction confirmed"})).toBeVisible()
  expect(reads.every(host => host === "terra-lcd.publicnode.com" || host === "phoenix-lcd.terra.dev")).toBe(true)
  expect(writes).toEqual([])
  expect(await page.evaluate(() => sessionStorage.getItem("burrito:unresolved-tx:v1"))).toBeNull()
})
