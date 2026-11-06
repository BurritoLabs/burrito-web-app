import { expect, test, type Page } from "@playwright/test"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Browser plugin not available: use the repository's Playwright workflow.
// Entirely synthetic, read-only acceptance fixtures. No real wallet or RPC is used.
const ADDRESS = "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv"
const CONTRACT = "terra1dut9t6cglr2ns2gherm7dtwk3u05xtz0gqan8a7j0ehtkqkdefws7g20e4"
const IBC_HASH = "A".repeat(64)
const IBC_DENOM = `ibc/${IBC_HASH}`
const pageErrors = new WeakMap<Page, string[]>()
const consoleMessages = new WeakMap<Page, Array<{ type: string; text: string; url: string }>>()
const unavailableFixtureUrls = new WeakMap<Page, Set<string>>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  const messages: Array<{ type: string; text: string; url: string }> = []
  pageErrors.set(page, errors)
  consoleMessages.set(page, messages)
  unavailableFixtureUrls.set(page, new Set())
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push({ type: message.type(), text: message.text(), url: message.location().url })
    }
  })
})
test.afterEach(async ({ page }) => {
  const unavailable = unavailableFixtureUrls.get(page)!
  const relevantMessages = consoleMessages.get(page)!.filter((message) => !(
    unavailable.has(message.url) &&
    /^Failed to load resource: (?:the server responded with a status of 404(?:\s|$)|net::ERR_(?:FAILED|BLOCKED_BY_CLIENT)(?:\s|$))/.test(message.text)
  ))
  expect(relevantMessages, "Unexpected application console errors/warnings").toEqual([])
})
const balances = [
  { denom: "uluna", amount: "2000000" },
  { denom: "ueight", amount: "100000000" },
  { denom: "uzero", amount: "123456789" },
  { denom: "umystery", amount: "100000000" },
  { denom: IBC_DENOM, amount: "987654321" }
]

const metadata = (base: string, symbol: string, decimals?: number) => ({
  metadata: {
    base,
    display: decimals === 0 ? base : symbol.toLowerCase(),
    name: symbol,
    symbol,
    denom_units: decimals === undefined ? [] : decimals === 0
      ? [{ denom: base, exponent: 0 }]
      : [{ denom: base, exponent: 0 }, { denom: symbol.toLowerCase(), exponent: decimals }]
  }
})

const historyCases = [
  { memo: "eight-decimal send", denom: "ueight", amount: "100000000", fee: "25000000" },
  { memo: "zero-decimal send", denom: "uzero", amount: "123456789", fee: "7" },
  { memo: "unknown-native send", denom: "umystery", amount: "100000000", fee: "1234567" },
  { memo: "unknown-ibc send", denom: IBC_DENOM, amount: "987654321", fee: "7654321" }
]

async function installSyntheticNetwork(page: Page, baseURL: string, malformedTaxRate = false) {
  const appOrigin = new URL(baseURL).origin
  const forbiddenRequests: string[] = []
  await page.route("**/*", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = decodeURIComponent(url.pathname)
    const json = (body: unknown) => route.fulfill({
      contentType: "application/json", body: JSON.stringify(body)
    })
    // Never forward a signer/broadcast/mutating API request to a live service.
    if (/broadcast|simulate|sign(_|\/|$)/i.test(path) ||
      (!/^(GET|HEAD)$/.test(request.method()) && !path.endsWith("/finder/account-assets") &&
        path !== "/terra/tx/v1beta1/compute_tax")) {
      forbiddenRequests.push(`${request.method()} ${path}`)
      return route.abort("blockedbyclient")
    }
    // compute_tax is a read-only quote endpoint, never a broadcast.
    if (path === "/terra/tx/v1beta1/compute_tax") return json({ tax_amount: [{ denom: "uluna", amount: "15000" }] })
    if (path === "/terra/tax/v1beta1/burn_tax_rate") return json(malformedTaxRate ? {} : { tax_rate: "0.005" })
    if (path.startsWith("/terra/taxexemption/v1/taxable/")) return json({ taxable: true })
    if (path.endsWith("/finder/prices")) {
      return json({ lunc: { usd: 2 }, luna: { usd: 3 }, ustc: { usd: 1 } })
    }
    if (path.endsWith("/registry/assets")) return json({ assets: [] })
    if (path.endsWith("/finder/account-assets")) return json({ cw20: [], ibc: [] })
    if (path.endsWith("/cw20/tokens.json")) {
      return json({ classic: { [CONTRACT]: {
        token: CONTRACT, symbol: "LUNC", name: "Synthetic ticker collision", decimals: 6
      } } })
    }
    if (path.includes("/cosmos/bank/v1beta1/balances/")) {
      return json({ balances: malformedTaxRate ? balances.map((coin) => coin.denom === "uluna"
        ? { ...coin, amount: "100000000" } : coin) : balances,
        pagination: { next_key: null, total: String(balances.length) } })
    }
    if (path.includes("/denoms_metadata/")) {
      const denom = path.split("/denoms_metadata/")[1]
      if (denom === "ueight") return json(metadata(denom, "EIGHT", 8))
      if (denom === "uzero") return json(metadata(denom, "ZERO", 0))
      if (denom === "umystery") return json(metadata(denom, "MYSTERY"))
      if (denom === IBC_DENOM) return json(metadata(denom, "MYSTERYIBC"))
      return json({})
    }
    if (path.endsWith(`/denom_traces/${IBC_HASH}`)) {
      return json({ denom_trace: { base_denom: "umysteryibc", path: "transfer/channel-999" } })
    }
    if (path.endsWith("/cosmos/tx/v1beta1/txs")) {
      return json({
        txs: historyCases.map(({ memo, denom, amount, fee }) => ({
          body: { memo, messages: [{
            "@type": "/cosmos.bank.v1beta1.MsgSend",
            from_address: ADDRESS, to_address: ADDRESS, amount: [{ denom, amount }]
          }] },
          auth_info: { fee: { amount: [{ denom, amount: fee }], gas_limit: "200000" } }
        })),
        tx_responses: historyCases.map((_, index) => ({
          txhash: String(index + 1).repeat(64), height: String(100 + index), code: 0,
          timestamp: "2026-11-06T12:00:00Z", logs: [], events: []
        })),
        pagination: { total: String(historyCases.length) }, total: String(historyCases.length)
      })
    }
    if (path.includes("/cosmwasm/wasm/v1/contract/") && path.includes("/smart/")) {
      const contract = path.split("/contract/")[1].split("/")[0]
      const query = JSON.parse(Buffer.from(path.split("/smart/")[1], "base64").toString())
      if ("balance" in query) return json({ data: { balance: contract === CONTRACT ? "3000000" : "0" } })
      if (contract === CONTRACT && "token_info" in query) {
        return json({ data: { name: "Synthetic ticker collision", symbol: "LUNC", decimals: 6 } })
      }
      return json({ data: {} })
    }
    if (path.endsWith("/assetlist.json")) return json({ assets: [] })
    if (path.endsWith("/validators")) return json({ validators: [], pagination: { total: "0" } })
    // Only application code/static assets may reach the local dev server. All
    // remote data plus local API proxies are fulfilled or blocked above/below.
    if (url.origin === appOrigin && !/^\/(coingecko|keybase|burrito-api|__registry-test|market\/)/.test(path) &&
      !/\/v1\//.test(path)) return route.continue()
    unavailableFixtureUrls.get(page)!.add(request.url())
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
  })
  await page.addInitScript(({ address }) => {
    window.localStorage.clear()
    window.localStorage.setItem("burrito:web-app:chain", "lunc")
    window.localStorage.setItem("burritoHideLowBalance", "false")
    window.localStorage.setItem("burritoWalletOpen", "false")
    const calls: string[] = []
    Object.defineProperty(window, "__financialFixtureCalls", { value: calls })
    Object.defineProperty(window, "BurritoNative", { value: {
      version: 1,
      request: async (method: string) => {
        calls.push(method)
        if (method === "bridge.getCapabilities") return {
          platform: "ios", protocolVersion: 1,
          // Adapter compatibility only: signing requests still throw below.
          capabilities: { localWallet: true, transactionSigning: true,
            supportedDirectSignTypeUrls: ["/cosmos.bank.v1beta1.MsgSend"] }
        }
        if (method === "wallet.getStatus") return { exists: true, deviceProtectionAvailable: true }
        if (method === "wallet.open") return { source: "burrito", accounts: ["columbus-5", "phoenix-1"].map((chainId) => ({
          source: "burrito", chainId, address, algorithm: "secp256k1",
          publicKey: "Aqy0vCZ9t3dGFL9gEcWZKbAGwlVDhqMJC6/ws/xBjsBE"
        })) }
        throw new Error(`Read-only fixture forbids native method: ${method}`)
      }
    } })
  }, { address: ADDRESS })
  return forbiddenRequests
}

async function connectFixture(page: Page, route: string) {
  await page.goto(route)
  await expect(page.getByRole("heading", { name: route === "/wallet" ? "Wallet" : "History", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Connect", exact: true }).first().click()
  await page.getByRole("button", { name: "Burrito Wallet Mobile", exact: true }).click()
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Close", exact: true }).click()
}

async function expectReadOnly(page: Page, forbiddenRequests: string[]) {
  expect(pageErrors.get(page)).toEqual([])
  expect(forbiddenRequests).toEqual([])
  expect(await page.evaluate(() => (
    window as Window & { __financialFixtureCalls?: string[] }
  ).__financialFixtureCalls)).toEqual([
    "bridge.getCapabilities", "wallet.getStatus", "wallet.open"
  ])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await expect(page.locator("vite-error-overlay")).toHaveCount(0)
  await page.screenshot({
    path: join(tmpdir(), `burrito-financial-${test.info().project.name}-${test.info().title.replace(/[^a-z0-9]+/gi, "-")}.png`),
    fullPage: true
  })
}

test("wallet respects 8/0 decimal units and keeps unknown precision raw and unsendable", async ({ page, baseURL }) => {
  const forbidden = await installSyntheticNetwork(page, baseURL!)
  await connectFixture(page, "/wallet")
  const row = (symbol: string) => page.locator('main div[class*="assetRow_"]').filter({
    has: page.locator('div[class*="assetName_"] > span').filter({ hasText: new RegExp(`^${symbol}$`) })
  })
  await expect(row("EIGHT").locator('[class*="assetAmount_"]')).toHaveText("1")
  await expect(row("ZERO").locator('[class*="assetAmount_"]')).toHaveText("123,456,789")
  for (const [symbol, amount] of [["MYSTERY", "100000000"], ["MYSTERYIBC", "987654321"]]) {
    await expect(row(symbol).locator('[class*="assetAmount_"]')).toHaveText(`${amount} raw units (precision unavailable)`)
    await expect(row(symbol).locator('[class*="assetValue_"]')).toHaveText("≈ --")
    await expect(row(symbol).getByRole("button", { name: "Send", exact: true })).toBeDisabled()
  }
  await expectReadOnly(page, forbidden)
})

test("a CW20 named LUNC never inherits the real native LUNC USD quote", async ({ page, baseURL }) => {
  const forbidden = await installSyntheticNetwork(page, baseURL!)
  await connectFixture(page, "/wallet")
  const rows = page.locator('main div[class*="assetRow_"]').filter({
    has: page.locator('div[class*="assetName_"] > span').filter({ hasText: /^LUNC$/ })
  })
  const native = rows.filter({ has: page.getByRole("button", { name: "Buy", exact: true }) })
  const impostor = rows.filter({ hasNot: page.getByRole("button", { name: "Buy", exact: true }) })
  await expect(native.locator('[class*="assetAmount_"]')).toHaveText("2")
  await expect(native.locator('[class*="assetValue_"]')).toHaveText("≈ $4")
  await expect(impostor.locator('[class*="assetAmount_"]')).toHaveText("3")
  await expect(impostor.locator('[class*="assetValue_"]')).toHaveText("≈ --")
  await expectReadOnly(page, forbidden)
})

test("history messages and fees share verified precision and raw unknown units", async ({ page, baseURL }) => {
  const forbidden = await installSyntheticNetwork(page, baseURL!)
  await connectFixture(page, "/history")
  const cases = [
    ["eight-decimal send", "1 EIGHT", "0.25 EIGHT"],
    ["zero-decimal send", "123,456,789 ZERO", "7 ZERO"],
    ["unknown-native send", "100,000,000 raw units MYSTERY", "1,234,567 raw units MYSTERY"],
    ["unknown-ibc send", "987,654,321 raw units MYSTERYIBC", "7,654,321 raw units MYSTERYIBC"]
  ]
  for (const [memo, amount, fee] of cases) {
    const card = page.locator("main .card").filter({ has: page.getByText(memo, { exact: true }) })
    await expect(card.locator('[class*="messagePrimary_"]')).toContainText(amount)
    await expect(card.locator('[class*="detailRow_"]').filter({
      has: page.getByText("Fee", { exact: true })
    }).locator('[class*="detailValue_"]')).toHaveText(fee)
  }
  await expectReadOnly(page, forbidden)
})

test("malformed burn-tax rate blocks sending despite a valid read-only tax quote", async ({ page, baseURL }) => {
  const forbidden = await installSyntheticNetwork(page, baseURL!, true)
  await connectFixture(page, "/wallet")
  const nativeRow = page.locator('main div[class*="assetRow_"]').filter({
    has: page.getByRole("button", { name: "Buy", exact: true })
  }).filter({ has: page.getByText("LUNC", { exact: true }) })
  const panel = page.getByRole("complementary", { name: "Wallet panel", exact: true })
  await nativeRow.getByRole("button", { name: "Send", exact: true }).click()
  await panel.getByRole("textbox", { name: "Recipient", exact: true }).fill(ADDRESS)
  const computedQuote = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/terra/tx/v1beta1/compute_tax" &&
    response.request().method() === "POST" && response.status() === 200)
  await panel.getByRole("textbox", { name: "Amount", exact: true }).fill("0.1")
  expect(await (await computedQuote).json()).toEqual({ tax_amount: [{ denom: "uluna", amount: "15000" }] })
  await expect(panel.getByText("Tax check unavailable", { exact: true }).first()).toBeVisible()
  await expect(panel.getByText("Tax status could not be verified right now.", { exact: true })).toBeVisible()
  await expect(panel.getByText("Burn tax disabled", { exact: true })).toHaveCount(0)
  await expect(panel.getByText("0.00%", { exact: true })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Send LUNC", exact: true })).toBeDisabled()
  await expectReadOnly(page, forbidden)
})

test("first Send click opens the deferred panel with the selected eight-decimal asset", async ({ page, baseURL }) => {
  const forbidden = await installSyntheticNetwork(page, baseURL!)
  await connectFixture(page, "/wallet")
  const eightRow = page.locator('main div[class*="assetRow_"]').filter({
    has: page.locator('div[class*="assetName_"] > span').filter({ hasText: /^EIGHT$/ })
  })
  await expect(eightRow.locator('[class*="assetAmount_"]')).toHaveText("1")
  await eightRow.getByRole("button", { name: "Send", exact: true }).click()
  const panel = page.getByRole("complementary", { name: "Wallet panel", exact: true })
  await expect(panel.getByRole("textbox", { name: "Recipient", exact: true })).toBeVisible()
  await expect(panel.getByRole("textbox", { name: "Amount", exact: true })).toBeEnabled()
  await expect(panel.getByText("Available: 1 EIGHT", { exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: "Send EIGHT", exact: true })).toBeDisabled()
  await expectReadOnly(page, forbidden)
})
