import { expect, test } from "@playwright/test"
import { installGovernanceFixtures } from "./fixtures/governance"

test("a vote with a lost receipt keeps its hash without authorizing another vote", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!)
  if (origin.hostname !== "127.0.0.1") throw new Error("Local Vite fixture only")
  const hash = "AB".repeat(32)
  const address = "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv"
  // No wallet, secret, real signature or network submission. External requests
  // (including local Vite proxy routes) and all sockets are blocked.
  await page.routeWebSocket(/.*/, (socket) => socket.close())
  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== "GET" || url.origin !== origin.origin ||
      /^\/(burrito-api|coingecko|keybase)(\/|$)/.test(url.pathname)) return route.abort()
    return route.continue()
  })
  await installGovernanceFixtures(page)
  await page.addInitScript(({ address }) => {
    localStorage.setItem("burrito:preferred-wallet", "keplr")
    Object.assign(window, { __voteCalls: { sign: 0, dispatch: 0 } })
    Object.defineProperty(window, "keplr", { value: {
      enable: async () => {},
      getKey: async () => ({ name: "Offline fixture", bech32Address: address })
    } })
  }, { address })
  const modulePath = "/src/app/wallet/walletAdapters.ts"
  await page.route((url) => url.origin === origin.origin && url.pathname === modulePath && !url.searchParams.has("original"), (route) => {
    const orig = new URL(route.request().url())
    orig.searchParams.set("original", "1")
    return route.fulfill({ contentType: "text/javascript", body: `
      export * from ${JSON.stringify(orig.href)};
      import { TxConfirmationUnknownError } from "/src/app/tx/broadcastOutcome.ts";
      export const getSignerAddressForConnector = async () => ${JSON.stringify(address)};
      export const connectStargateClientForConnector = async () => ({
        simulate: async () => 100, getSequence: async () => ({ accountNumber: 1, sequence: 0 }),
        sign: async () => {
          window.__voteCalls.sign++;
          return { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] };
        },
        broadcastTx: async () => {
          window.__voteCalls.dispatch++;
          throw new TxConfirmationUnknownError(${JSON.stringify(hash)}, "columbus-5");
        }
      });
    ` })
  })
  await page.goto("/proposal/99001")
  await page.getByRole("button", { name: "Vote", exact: true }).click()
  const submit = page.getByRole("button", { name: "Submit vote", exact: true })
  await expect(submit).toBeEnabled()
  // Two same-turn UI events can outpace React's disabled state. The
  // transaction guard must claim the action synchronously.
  await submit.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  const status = page.getByRole("dialog", { name: "Confirmation unknown" })
  await expect(status).toBeVisible()
  await expect(status.getByRole("link", { name: /^ABABAB/ })).toHaveAttribute("href", new RegExp(hash + "$"))
  await expect(page.getByRole("dialog", { name: "Transaction confirmed" })).toHaveCount(0)
  expect(await page.evaluate(() => (window as Window & { __voteCalls: object }).__voteCalls))
    .toEqual({ sign: 1, dispatch: 1 })
})
