import { expect, test, type Page } from "@playwright/test"

const installPendingExtension = async (page: Page, holdDisconnect = false) => {
  await page.addInitScript((holdDisconnect) => {
    window.localStorage.setItem("burrito:web-app:chain", "lunc")
    const controls = { connects: 0, disconnects: 0, release: () => {}, releaseDisconnect: () => {} }
    Object.assign(window, { __walletRace: controls })
    Object.defineProperty(window, "BurritoWallet", { value: {
      version: 1,
      request: async (method: string, params: Record<string, unknown> = {}) => {
        if (method === "wallet.getCapabilities") return {
          protocolVersion: 1,
          platform: "chrome",
          supportedChainIds: ["columbus-5", "phoenix-1"],
          supportedDirectSignTypeUrls: ["/cosmos.bank.v1beta1.MsgSend"],
          transactionSigning: true,
          messageSigning: true
        }
        if (method === "wallet.disconnect") {
          controls.disconnects += 1
          if (holdDisconnect) await new Promise<void>((resolve) => { controls.releaseDisconnect = resolve })
          return { disconnected: true }
        }
        if (method !== "wallet.connect") throw new Error("Unexpected request")
        controls.connects += 1
        if (controls.connects === 1) await new Promise<void>((resolve) => { controls.release = resolve })
        return { source: "burrito", accounts: [{
          source: "burrito",
          chainId: (params.chainIds as string[])[0],
          address: "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv",
          algorithm: "secp256k1",
          publicKey: "Aqy0vCZ9t3dGFL9gEcWZKbAGwlVDhqMJC6/ws/xBjsBE"
        }] }
      }
    } })
  }, holdDisconnect)
}

const extensionButton = (page: Page) => page.getByRole("button")
  .filter({ hasText: "Burrito Wallet" }).filter({ hasText: "Extension" })

const connectExtension = async (page: Page) => {
  await page.getByRole("button", { name: "Connect", exact: true }).first().click()
  await extensionButton(page).click()
}

const pendingCalls = (page: Page) => page.evaluate(() => (
  window as Window & { __walletRace: { connects: number } }
).__walletRace.connects)

test("cancelled extension approval cannot replace a newer connected session with an error", async ({ page }) => {
  await installPendingExtension(page)
  await page.goto("/")
  await connectExtension(page)
  await expect.poll(() => pendingCalls(page)).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new Event("burrito:wallet-accounts-changed-v1")))
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await connectExtension(page)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await page.evaluate(() => (window as Window & { __walletRace: { release: () => void } }).__walletRace.release())
  await expect(page.getByText("connection changed", { exact: false })).toHaveCount(0)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => ({
    connector: localStorage.getItem("burritoWalletConnector"),
    manual: localStorage.getItem("burritoWalletManuallyDisconnected")
  }))).toEqual({ connector: "burrito-extension", manual: null })
})

test("an account change during the first lazy adapter load prevents a new approval", async ({ page }) => {
  await installPendingExtension(page)
  await page.goto("/")
  let releaseAdapter!: () => void
  let requested = false
  const adapterGate = new Promise<void>((resolve) => { releaseAdapter = resolve })
  await page.route("**/src/app/wallet/walletAdapters.ts*", async (route) => {
    requested = true
    await adapterGate
    await route.continue()
  })
  await connectExtension(page)
  await expect.poll(() => requested).toBe(true)
  await page.evaluate(() => window.dispatchEvent(new Event("burrito:wallet-accounts-changed-v1")))
  releaseAdapter()
  await page.evaluate(async () => {
    const adapterModule = "/src/app/wallet/walletAdapters.ts"
    await import(/* @vite-ignore */ adapterModule)
  })
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  await expect.poll(() => pendingCalls(page)).toBe(0)
  await expect.poll(() => page.evaluate(() => ({
    connector: localStorage.getItem("burritoWalletConnector"),
    manual: localStorage.getItem("burritoWalletManuallyDisconnected")
  }))).toEqual({ connector: null, manual: "true" })
})

test("a slow disconnect completes without removing a newer wallet connection", async ({ page }) => {
  await installPendingExtension(page, true)
  await page.goto("/")
  await connectExtension(page)
  await expect.poll(() => pendingCalls(page)).toBe(1)
  await page.evaluate(() => (window as Window & { __walletRace: { release: () => void } }).__walletRace.release())
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await page.getByRole("button", { name: "Burrito Wallet", exact: true }).click()
  await page.getByRole("button", { name: "Disconnect", exact: true }).click()
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __walletRace: { disconnects: number } }
  ).__walletRace.disconnects)).toBe(1)
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  const close = page.getByRole("button", { name: "Close" })
  if (await close.isVisible()) await close.click()
  await connectExtension(page)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await page.evaluate(() => (window as Window & { __walletRace: { releaseDisconnect: () => void } }).__walletRace.releaseDisconnect())
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => ({
    connector: localStorage.getItem("burritoWalletConnector"),
    manual: localStorage.getItem("burritoWalletManuallyDisconnected")
  }))).toEqual({ connector: "burrito-extension", manual: null })
})
