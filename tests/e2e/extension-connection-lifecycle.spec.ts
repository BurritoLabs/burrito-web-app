import { expect, test, type Page } from "@playwright/test"

// Mock-provider integration tests against the actual app and controllers.
// This is NOT installed-extension acceptance: approval decisions and timeout
// errors below are synthetic. No seed, password, signature, or broadcast exists.
type ChainId = "columbus-5" | "phoenix-1"
type ConnectionErrorCode = "USER_REJECTED" | "WALLET_LOCKED" | "UNAUTHORIZED" | "BUSY"
type ProviderCall = { method: string; chainIds?: ChainId[] }
type ProviderSnapshot = {
  grants: ChainId[]
  locked: boolean
  calls: ProviderCall[]
  approvals: number
  maxPending: number
  unexpectedMethods: string[]
  pendingChainIds: ChainId[] | null
}
type ProviderControls = {
  snapshot: () => ProviderSnapshot
  approve: () => void
  approveNext: () => void
  reject: (code: ConnectionErrorCode, message?: string) => void
  revoke: () => void
}
type TestWindow = typeof window & { __extensionLifecycle: ProviderControls }
type KeplrTestWindow = typeof window & {
  __keplrLifecycle: {
    snapshot: () => { enables: number; keyReads: number; pending: boolean }
    holdNextKey: () => void
    releaseKey: () => void
  }
}
type ProviderOptions = {
  grants?: ChainId[]
  locked?: boolean
  remembered?: boolean
  runtime?: boolean
}

const PROVIDER_STORAGE_KEY = "burrito:e2e:extension-lifecycle:public-state"
const CONNECTOR_STORAGE_KEY = "burritoWalletConnector"
const pageErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("A local Playwright baseURL is required")
  const appOrigin = new URL(baseURL).origin
  expect(new URL(appOrigin).hostname).toBe("127.0.0.1")
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on("pageerror", (error) => errors.push(error.message))

  // Preserve real local Vite/app assets but never reach production directly or
  // through Vite's external API proxies. Offline API failures are expected.
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url())
    if (
      url.origin !== appOrigin ||
      /^\/(coingecko|keybase|burrito-api)(\/|$)/.test(url.pathname)
    ) {
      await route.abort("internetdisconnected")
      return
    }
    if (url.pathname.startsWith("/__registry-test/")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ cw20: [], ibc: [] })
      })
      return
    }
    await route.continue()
  })
  await page.routeWebSocket(/.*/, (socket) => {
    // No connection to WalletConnect relays (or Vite HMR) is necessary here.
    socket.close()
  })
})

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? [], "uncaught app errors").toEqual([])
  const unexpected = await page.evaluate(() =>
    (window as Partial<TestWindow>).__extensionLifecycle?.snapshot().unexpectedMethods
  )
  expect(unexpected ?? [], "signing/broadcast/unexpected provider calls").toEqual([])
})

const installProvider = async (page: Page, options: ProviderOptions = {}) => {
  await page.addInitScript(({ options, storageKey }) => {
    type Chain = "columbus-5" | "phoenix-1"
    type State = Omit<ProviderSnapshot, "pendingChainIds">
    const saved = localStorage.getItem(storageKey)
    const state: State = saved ? JSON.parse(saved) : {
      grants: options.grants ?? [],
      locked: options.locked ?? false,
      calls: [], approvals: 0, maxPending: 0, unexpectedMethods: []
    }
    if (!saved) {
      localStorage.setItem("burrito:web-app:chain", "lunc")
      localStorage.removeItem("burritoWalletManuallyDisconnected")
      if (options.runtime) {
        // Existing supported boot path. There are no saved WalletConnect
        // pairings/sessions and no mobile-wallet connection is requested.
        localStorage.setItem("burritoWalletConnector", "keplr-mobile")
      } else if (options.remembered) {
        localStorage.setItem("burritoWalletConnector", "burrito-extension")
      } else {
        localStorage.removeItem("burritoWalletConnector")
      }
    }
    const persist = () => localStorage.setItem(storageKey, JSON.stringify(state))
    persist()
    const providerError = (code: ConnectionErrorCode, message = "Synthetic provider failure") =>
      Object.assign(new Error(message), { code })
    const accounts = (chainIds: Chain[]) => ({
      source: "burrito",
      accounts: chainIds.map((chainId) => ({
        source: "burrito", chainId,
        // Existing public test vector, never a funded or user-owned wallet.
        address: "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv",
        algorithm: "secp256k1",
        publicKey: "Aqy0vCZ9t3dGFL9gEcWZKbAGwlVDhqMJC6/ws/xBjsBE"
      }))
    })
    let pending: {
      chainIds: Chain[]
      resolve: (value: ReturnType<typeof accounts>) => void
      reject: (error: Error) => void
    } | undefined
    let approveNext = false
    const controls: ProviderControls = {
      snapshot: () => ({ ...state, pendingChainIds: pending?.chainIds ?? null }),
      approveNext: () => { approveNext = true },
      approve: () => {
        if (!pending) throw new Error("No synthetic approval is pending")
        const request = pending
        pending = undefined
        state.grants = [...new Set([...state.grants, ...request.chainIds])]
        persist()
        request.resolve(accounts(request.chainIds))
      },
      reject: (code, message) => {
        if (!pending) throw new Error("No synthetic approval is pending")
        const request = pending
        pending = undefined
        request.reject(providerError(code, message))
      },
      revoke: () => {
        state.grants = []
        persist()
        if (pending) controls.reject("UNAUTHORIZED")
        window.dispatchEvent(new Event("burrito:wallet-accounts-changed-v1"))
      }
    }
    Object.defineProperty(window, "__extensionLifecycle", { value: controls })
    Object.defineProperty(window, "BurritoWallet", {
      configurable: false, writable: false,
      value: {
        version: 1,
        request: async (method: string, params: Record<string, unknown> = {}) => {
          const chainIds = Array.isArray(params.chainIds) ? params.chainIds as Chain[] : undefined
          state.calls.push({ method, ...(chainIds ? { chainIds } : {}) })
          persist()
          if (method === "wallet.getCapabilities") return {
            protocolVersion: 1, platform: "chrome",
            supportedChainIds: ["columbus-5", "phoenix-1"],
            supportedDirectSignTypeUrls: ["/cosmos.bank.v1beta1.MsgSend"],
            transactionSigning: true, messageSigning: true
          }
          if (method === "wallet.disconnect") {
            state.grants = []
            persist()
            return { disconnected: true }
          }
          if (method !== "wallet.connect" && method !== "wallet.getAccounts") {
            state.unexpectedMethods.push(method)
            persist()
            throw new Error("Unexpected provider method in connection-only test")
          }
          if (!chainIds?.length || chainIds.some((id) => id !== "columbus-5" && id !== "phoenix-1")) {
            throw new Error("Unexpected chain in connection test")
          }
          if (state.locked) throw providerError("WALLET_LOCKED")
          const authorized = chainIds.every((id) => state.grants.includes(id))
          if (method === "wallet.getAccounts") {
            if (!authorized) throw providerError("UNAUTHORIZED")
            return accounts(chainIds)
          }
          if (authorized) return accounts(chainIds)
          if (pending) throw providerError("BUSY")
          state.approvals += 1
          state.maxPending = Math.max(state.maxPending, 1)
          persist()
          return new Promise<ReturnType<typeof accounts>>((resolve, reject) => {
            pending = { chainIds, resolve, reject }
            if (approveNext) {
              approveNext = false
              queueMicrotask(() => controls.approve())
            }
          })
        }
      }
    })
  }, { options, storageKey: PROVIDER_STORAGE_KEY })
}

const installKeplr = (page: Page) => page.addInitScript(() => {
  let enables = 0
  let keyReads = 0
  let holdNext = false
  let release: (() => void) | undefined
  Object.defineProperty(window, "__keplrLifecycle", { value: {
    snapshot: () => ({ enables, keyReads, pending: Boolean(release) }),
    holdNextKey: () => { holdNext = true },
    releaseKey: () => {
      if (!release) throw new Error("No synthetic Keplr account read is pending")
      const resolve = release
      release = undefined
      resolve()
    }
  } })
  Object.defineProperty(window, "keplr", { value: {
    enable: async () => { enables += 1 },
    getKey: async () => {
      keyReads += 1
      if (holdNext) {
        holdNext = false
        await new Promise<void>((resolve) => { release = resolve })
      }
      return {
        name: "Public Keplr QA",
        bech32Address: "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv"
      }
    }
  } })
})

const snapshot = (page: Page) => page.evaluate(() =>
  (window as TestWindow).__extensionLifecycle.snapshot()
)
const accountCalls = async (page: Page) => (await snapshot(page)).calls.filter(
  ({ method }) => method === "wallet.connect" || method === "wallet.getAccounts"
)
const rememberedConnector = (page: Page) => page.evaluate(
  (key) => localStorage.getItem(key), CONNECTOR_STORAGE_KEY
)
const extensionButton = (page: Page) => page.getByRole("button")
  .filter({ hasText: "Burrito Wallet" }).filter({ hasText: "Extension" })
const connectedButton = (page: Page) => page.getByRole("button", { name: "Burrito Wallet", exact: true })
const openApp = async (page: Page) => {
  await page.goto("/privacy")
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page).toHaveTitle("Privacy Policy | Burrito")
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible()
  await expect(page.locator("vite-error-overlay")).toHaveCount(0)
}
const beginConnection = async (page: Page) => {
  if (!await page.getByRole("dialog").isVisible()) {
    await page.getByRole("button", { name: "Connect", exact: true }).first().click()
  }
  await expect(extensionButton(page)).toBeEnabled()
  await extensionButton(page).click()
}
const approve = (page: Page) => page.evaluate(() => (window as TestWindow).__extensionLifecycle.approve())
const reject = (page: Page, code: ConnectionErrorCode, message?: string) => page.evaluate(
  ({ code, message }) => (window as TestWindow).__extensionLifecycle.reject(code, message), { code, message }
)
const closeDialog = async (page: Page) => {
  if (await page.getByRole("dialog").isVisible()) await page.getByRole("button", { name: "Close", exact: true }).click()
}
const switchChain = async (page: Page, chain: "lunc" | "luna") => {
  await closeDialog(page)
  await page.getByRole("button", { name: "Switch network", exact: true }).click()
  await page.getByRole("menuitem").filter({ hasText: chain === "luna" ? "LUNA" : "LUNC" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-app-chain", chain)
}
const expectPending = async (page: Page, chainId: ChainId) => {
  await expect.poll(async () => (await snapshot(page)).pendingChainIds).toEqual([chainId])
  await expect(extensionButton(page)).toBeDisabled()
  await expect(page.getByRole("button", { name: "Switch network", exact: true })).toBeDisabled()
  await expect(page.getByRole("status").filter({ hasText: "Continue in Burrito Wallet" })).toContainText(
    "Finish or cancel the request there before switching networks"
  )
}

test("explicit Connect owns one pending request, blocks network changes, and remembers only success", async ({ page }) => {
  await installProvider(page)
  await openApp(page)
  expect(await accountCalls(page)).toEqual([])
  await beginConnection(page)
  await expectPending(page, "columbus-5")
  expect(await rememberedConnector(page)).toBeNull()
  expect(await accountCalls(page)).toEqual([{ method: "wallet.connect", chainIds: ["columbus-5"] }])
  await closeDialog(page)
  await expect(page.getByRole("button", { name: "Switch network", exact: true })).toBeDisabled()
  expect((await snapshot(page)).pendingChainIds).toEqual(["columbus-5"])
  expect((await snapshot(page)).approvals).toBe(1)
  await approve(page)
  await expect(connectedButton(page)).toBeVisible()
  await expect(page.getByRole("button", { name: "Switch network", exact: true })).toBeEnabled()
  await expect.poll(() => rememberedConnector(page)).toBe("burrito-extension")
  expect((await snapshot(page)).grants).toEqual(["columbus-5"])
  expect((await snapshot(page)).maxPending).toBe(1)
})

test("Escape dismisses only the connection panel while approval stays pending", async ({ page }) => {
  await installProvider(page)
  await openApp(page)
  await beginConnection(page)
  await expectPending(page, "columbus-5")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Switch network", exact: true })).toBeDisabled()
  expect((await snapshot(page)).pendingChainIds).toEqual(["columbus-5"])
  expect((await snapshot(page)).approvals).toBe(1)
  expect((await snapshot(page)).grants).toEqual([])
  await reject(page, "USER_REJECTED", "Connection request cancelled by the user.")
  await expect(page.getByRole("button", { name: "Switch network", exact: true })).toBeEnabled()
  expect((await snapshot(page)).pendingChainIds).toBeNull()
  expect((await snapshot(page)).approvals).toBe(1)
  expect(await rememberedConnector(page)).toBeNull()
})

for (const scenario of [
  { label: "Cancel", message: "Connection request cancelled by the user." },
  { label: "synthetic timeout", message: "Request approval timed out." }
]) {
  test(`${scenario.label} is code-mapped, does not auto-connect on reload, and permits explicit retry`, async ({ page }) => {
    await installProvider(page)
    await openApp(page)
    await beginConnection(page)
    await expectPending(page, "columbus-5")
    await reject(page, "USER_REJECTED", scenario.message)
    await expect(page.getByRole("alert")).toContainText("Connection cancelled. Choose Connect")
    await expect(extensionButton(page)).toBeEnabled()
    await expect(page.getByRole("button", { name: "Switch network", exact: true })).toBeEnabled()
    expect(await rememberedConnector(page)).toBeNull()
    await page.reload()
    await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible()
    // Cover the existing 700 ms restore delay; this is a negative observation,
    // not a simulated three-minute extension alarm test.
    await page.waitForTimeout(1000)
    expect(await accountCalls(page)).toEqual([{ method: "wallet.connect", chainIds: ["columbus-5"] }])
    expect((await snapshot(page)).pendingChainIds).toBeNull()
    await beginConnection(page)
    await expectPending(page, "columbus-5")
    expect((await snapshot(page)).approvals).toBe(2)
    await approve(page)
    await expect(page.getByText("Connected", { exact: true })).toBeVisible()
    await expect.poll(() => rememberedConnector(page)).toBe("burrito-extension")
  })
}

test("remembered authorized sessions reload with getAccounts and never reopen approval", async ({ page }) => {
  await installProvider(page, { remembered: true, grants: ["columbus-5"] })
  await openApp(page)
  await expect(connectedButton(page)).toBeVisible()
  expect(await accountCalls(page)).toEqual([{ method: "wallet.getAccounts", chainIds: ["columbus-5"] }])
  await page.reload()
  await expect(connectedButton(page)).toBeVisible()
  expect(await accountCalls(page)).toEqual([
    { method: "wallet.getAccounts", chainIds: ["columbus-5"] },
    { method: "wallet.getAccounts", chainIds: ["columbus-5"] }
  ])
  expect((await snapshot(page)).approvals).toBe(0)
  expect((await snapshot(page)).pendingChainIds).toBeNull()
})

for (const scenario of [
  { label: "unauthorized", grants: [] as ChainId[], locked: false, hint: "not authorized for that network" },
  { label: "locked", grants: ["columbus-5"] as ChainId[], locked: true, hint: "Unlock Burrito Wallet" }
]) {
  test(`remembered ${scenario.label} session only reads accounts without an approval`, async ({ page }) => {
    await installProvider(page, { remembered: true, grants: scenario.grants, locked: scenario.locked })
    await openApp(page)
    await expect.poll(() => accountCalls(page)).toEqual([{ method: "wallet.getAccounts", chainIds: ["columbus-5"] }])
    await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
    await page.getByRole("button", { name: "Connect", exact: true }).first().click()
    await expect(page.getByRole("alert")).toContainText(scenario.hint)
    expect((await snapshot(page)).pendingChainIds).toBeNull()
    expect((await snapshot(page)).approvals).toBe(0)
    expect((await snapshot(page)).calls.some(({ method }) => method === "wallet.connect")).toBe(false)
  })
}

test("chain changes only restore grants; cancelled explicit upgrade keeps the old chain grant", async ({ page }) => {
  await installProvider(page, { remembered: true, grants: ["columbus-5"] })
  await openApp(page)
  await expect(connectedButton(page)).toBeVisible()
  await switchChain(page, "luna")
  await expect.poll(async () => (await accountCalls(page)).at(-1)).toEqual({ method: "wallet.getAccounts", chainIds: ["phoenix-1"] })
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  expect((await snapshot(page)).approvals).toBe(0)
  await beginConnection(page)
  await expectPending(page, "phoenix-1")
  await reject(page, "USER_REJECTED")
  await expect(page.getByRole("alert")).toContainText("Connection cancelled")
  expect((await snapshot(page)).grants).toEqual(["columbus-5"])
  await switchChain(page, "lunc")
  await expect(connectedButton(page)).toBeVisible()
  expect((await accountCalls(page)).at(-1)).toEqual({ method: "wallet.getAccounts", chainIds: ["columbus-5"] })
  expect((await snapshot(page)).approvals).toBe(1)
  await switchChain(page, "luna")
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  await beginConnection(page)
  await expectPending(page, "phoenix-1")
  await approve(page)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  expect((await snapshot(page)).grants).toEqual(["columbus-5", "phoenix-1"])
  await switchChain(page, "lunc")
  await expect(connectedButton(page)).toBeVisible()
  await switchChain(page, "luna")
  await expect(connectedButton(page)).toBeVisible()
  expect((await snapshot(page)).approvals).toBe(2)
  expect((await accountCalls(page)).filter(({ method }) => method === "wallet.connect")).toEqual([
    { method: "wallet.connect", chainIds: ["phoenix-1"] },
    { method: "wallet.connect", chainIds: ["phoenix-1"] }
  ])
})

test("revocation event disconnects and suppresses automatic restoration after reload", async ({ page }) => {
  await installProvider(page, { remembered: true, grants: ["columbus-5"] })
  await openApp(page)
  await expect(connectedButton(page)).toBeVisible()
  await page.evaluate(() => (window as TestWindow).__extensionLifecycle.revoke())
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  expect(await rememberedConnector(page)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem("burritoWalletManuallyDisconnected"))).toBe("true")
  const beforeReload = await accountCalls(page)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible()
  await page.waitForTimeout(1000)
  expect(await accountCalls(page)).toEqual(beforeReload)
  expect((await snapshot(page)).grants).toEqual([])
  await beginConnection(page)
  await expectPending(page, "columbus-5")
  await approve(page)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("burritoWalletManuallyDisconnected"))).toBeNull()
})

test("a queued old Keplr event cannot reclaim a newly selected Burrito connection", async ({ page }) => {
  await installProvider(page)
  await installKeplr(page)
  await openApp(page)
  await page.getByRole("button", { name: "Connect", exact: true }).first().click()
  const keplrButton = page.getByRole("button").filter({ hasText: "Keplr" }).filter({ hasText: "Extension" })
  await keplrButton.click()
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  expect(await rememberedConnector(page)).toBe("keplr")

  // Dispatch and click in the same browser task so the real 100 ms reconnect
  // timer is queued before the user selects Burrito, independent of CI latency.
  // Only the mock provider decision is instantaneous; no app timer is replaced.
  await extensionButton(page).evaluate((button) => {
    (window as TestWindow).__extensionLifecycle.approveNext()
    window.dispatchEvent(new Event("keplr_keystorechange"))
    ;(button as HTMLButtonElement).click()
  })
  await expect(connectedButton(page)).toBeVisible()
  await expect.poll(() => rememberedConnector(page)).toBe("burrito-extension")
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => (window as KeplrTestWindow).__keplrLifecycle.snapshot())).toEqual({
    enables: 1, keyReads: 1, pending: false
  })
  expect((await snapshot(page)).approvals).toBe(1)
  await expect(connectedButton(page)).toBeVisible()
  expect(await rememberedConnector(page)).toBe("burrito-extension")
})

test("an old Burrito revocation event does not cancel a newly pending Keplr connection", async ({ page }) => {
  await installProvider(page)
  await installKeplr(page)
  await openApp(page)
  await beginConnection(page)
  await expectPending(page, "columbus-5")
  await approve(page)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await page.evaluate(() => (window as KeplrTestWindow).__keplrLifecycle.holdNextKey())
  const keplrButton = page.getByRole("button").filter({ hasText: "Keplr" }).filter({ hasText: "Extension" })
  await keplrButton.click()
  await expect.poll(() => page.evaluate(() => (window as KeplrTestWindow).__keplrLifecycle.snapshot().pending)).toBe(true)
  await page.evaluate(() => (window as TestWindow).__extensionLifecycle.revoke())
  await expect(keplrButton).toBeDisabled()
  await page.evaluate(() => (window as KeplrTestWindow).__keplrLifecycle.releaseKey())
  await expect(page.getByRole("button", { name: "Public Keplr QA", exact: true })).toBeVisible()
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await expect.poll(() => rememberedConnector(page)).toBe("keplr")
  expect(await page.evaluate(() => localStorage.getItem("burritoWalletManuallyDisconnected"))).toBeNull()
  expect((await snapshot(page)).grants).toEqual([])
})

test("wallet address and QR views expose distinct accessible close controls", async ({ page }) => {
  await installProvider(page, { remembered: true, grants: ["columbus-5"] })
  await openApp(page)
  await expect(connectedButton(page)).toBeVisible()
  await connectedButton(page).click()
  await page.getByRole("button", { name: "View wallet addresses", exact: true }).click()
  const closeAddresses = page.getByRole("button", { name: "Close wallet addresses", exact: true })
  await expect(closeAddresses).toBeVisible()
  await page.getByRole("button", { name: "Show QR code", exact: true }).click()
  await expect(page.getByRole("img", { name: "Wallet address QR code", exact: true })).toBeVisible()
  const closeQr = page.getByRole("button", { name: "Close QR code", exact: true })
  await expect(closeQr).toBeVisible()
  await closeQr.click()
  await expect(closeQr).toHaveCount(0)
  await expect(closeAddresses).toBeVisible()
  await closeAddresses.click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(connectedButton(page)).toBeVisible()
  expect((await snapshot(page)).approvals).toBe(0)
})

test("real lazy runtime controller also gates pending extension requests and restores chains read-only", async ({ page }) => {
  test.setTimeout(60000)
  await installProvider(page, { runtime: true })
  const runtimeLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/src/app/wallet/WalletRuntimeProvider.tsx" && response.ok()
  )
  await openApp(page)
  await (await runtimeLoaded).finished()
  // Wait for the actual lazy module's dependency graph, without replacing it.
  await page.evaluate(async () => {
    const runtimeModule = "/src/app/wallet/WalletRuntimeProvider.tsx"
    await import(/* @vite-ignore */ runtimeModule)
  })
  expect(await rememberedConnector(page)).toBe("keplr-mobile")
  await beginConnection(page)
  await expectPending(page, "columbus-5")
  expect(await rememberedConnector(page)).not.toBe("burrito-extension")
  await approve(page)
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  await expect.poll(() => rememberedConnector(page)).toBe("burrito-extension")
  await switchChain(page, "luna")
  await expect.poll(async () => (await accountCalls(page)).at(-1)).toEqual({ method: "wallet.getAccounts", chainIds: ["phoenix-1"] })
  await expect(page.getByRole("button", { name: "Connect", exact: true }).first()).toBeVisible()
  expect((await snapshot(page)).approvals).toBe(1)
  await switchChain(page, "lunc")
  await expect(connectedButton(page)).toBeVisible()
  expect((await accountCalls(page)).at(-1)).toEqual({ method: "wallet.getAccounts", chainIds: ["columbus-5"] })
  expect((await snapshot(page)).approvals).toBe(1)
})
