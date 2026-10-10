import { expect, test, type Page } from "@playwright/test"

const REGISTRY_TEST_PATH = "/__registry-test"
const PRICE_PATH = `${REGISTRY_TEST_PATH}/v1/finder/prices`
const LOCAL_API_PROXY_PREFIXES = [
  "/coingecko/",
  "/burrito-api/",
  "/__market-test/",
  `${REGISTRY_TEST_PATH}/`
]
const ALLOWED_REQUEST_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const PRICE_CACHE_KEY = "burritoPriceCache"
const PRICE_MAX_AGE_MS = 5 * 60 * 1000

type PriceResponse = {
  status: number
  body?: unknown
}

const completePrices = (asOf: number) => ({
  luna: { usd: 0.16 },
  lunc: { usd: 0.00005 },
  ustc: { usd: 0.005 },
  _meta: { asOf, stale: false }
})

const installMarketNetworkMocks = async (
  page: Page,
  getPriceResponse: () => PriceResponse
) => {
  let priceRequests = 0

  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    // This route-level regression performs reads only; stop every write or
    // other non-safe method before it can reach Vite or any upstream service.
    if (!ALLOWED_REQUEST_METHODS.has(method)) {
      await route.abort()
      return
    }

    // The Vite dev server is local. Allow versioned JSON/assets such as the
    // packaged market index. Never let local Vite proxy paths fall through to
    // real public providers or APIs.
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      if (url.pathname === PRICE_PATH && method === "GET") {
        priceRequests += 1
        const response = getPriceResponse()
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: JSON.stringify(response.body ?? {})
        })
        return
      }
      if (LOCAL_API_PROXY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
        await route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
        return
      }
      await route.continue()
      return
    }

    // Public price providers and all other external reads are deterministic.
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
  })

  return () => priceRequests
}

const readCachedPrices = (page: Page) =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as { ts?: number; data?: { _meta?: { asOf?: number } } } : null
  }, PRICE_CACHE_KEY)

test("market price notice clears after retry returns a fresh response without reload", async ({
  page
}) => {
  let response: PriceResponse = { status: 503 }
  const getPriceRequestCount = await installMarketNetworkMocks(page, () => response)
  await page.goto("/market")
  await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible()

  const notice = page.getByRole("status").filter({ hasText: "Price estimates are unavailable." })
  await expect(notice).toBeVisible()
  await expect(notice.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
  expect(getPriceRequestCount()).toBeGreaterThan(0)

  const freshAsOf = Date.now()
  response = { status: 200, body: completePrices(freshAsOf) }
  await notice.getByRole("button", { name: "Retry", exact: true }).click()

  await expect(notice).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe("/market")
  expect(getPriceRequestCount()).toBeGreaterThan(1)
  await expect.poll(async () => {
    const cache = await readCachedPrices(page)
    return [cache?.ts, cache?.data?._meta?.asOf]
  }).toEqual([freshAsOf, freshAsOf])

  await page.getByRole("searchbox", { name: "Search pools / tokens / contracts" })
    .fill("terra1m6ywlgn6wrjuagcmmezzz2a029gtldhey5k552")
  await expect(page.getByText("1 pool", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /^Astroport \d+$/ }).click()
  await expect(page.getByText("1 Astroport pool", { exact: true })).toBeVisible()
})

test("market price notice appears when mounted fresh metadata ages past five minutes", async ({
  page
}) => {
  const now = Date.now()
  const asOf = now - PRICE_MAX_AGE_MS + 5_000
  await page.clock.install({ time: new Date(now) })
  const getPriceRequestCount = await installMarketNetworkMocks(page, () => ({
    status: 200,
    body: completePrices(asOf)
  }))

  await page.goto("/market")
  await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible()
  const delayedNotice = page.getByRole("status").filter({ hasText: "Price estimates are delayed." })
  await expect(delayedNotice).toHaveCount(0)

  await expect.poll(async () => {
    const cache = await readCachedPrices(page)
    return [cache?.ts, cache?.data?._meta?.asOf]
  }).toEqual([asOf, asOf])

  // The mounted notice schedules the remaining age interval; advancing the
  // browser clock exercises expiry without sleeping or reloading the page.
  await page.clock.fastForward(5_001)
  await expect(delayedNotice).toBeVisible()
  expect(getPriceRequestCount()).toBeGreaterThan(0)
  expect(new URL(page.url()).pathname).toBe("/market")

  const cache = await readCachedPrices(page)
  expect(cache?.ts).toBe(asOf)
  expect(cache?.data?._meta?.asOf).toBe(asOf)
})
