import { expect, test } from "@playwright/test"

const getHeaderMetrics = async (page: import("@playwright/test").Page) =>
  page.getByRole("banner").evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      position: style.position,
      zIndex: Number(style.zIndex) || 0
    }
  })

test("mobile market keeps the fixed header above content and covers the bottom", async ({
  page
}) => {
  await page.goto("/market")

  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Market" })).toBeVisible()
  const networkSwitcher = page.getByRole("button", { name: "Switch network" })
  await expect(networkSwitcher).toBeVisible()
  await expect(networkSwitcher).toHaveCSS("width", "44px")
  await expect(networkSwitcher.getByText("LUNC", { exact: true })).toBeHidden()
  await expect(async () => {
    if (!(await page.getByRole("dialog").isVisible())) {
      await page.getByRole("button", { name: "Connect" }).click()
    }
    await expect(page.getByRole("button", { name: /Keplr Mobile/ })).toBeEnabled({
      timeout: 1000
    })
  }).toPass({ timeout: 15_000 })
  await page.getByRole("button", { name: "Close" }).click()

  const header = await getHeaderMetrics(page)
  expect(header.position).toBe("fixed")
  expect(header.zIndex).toBeGreaterThanOrEqual(500)
  expect(header.top).toBeGreaterThanOrEqual(0)
  expect(header.top).toBeLessThan(2)
  expect(header.height).toBeGreaterThanOrEqual(56)

  const mainTop = await page.locator("main").evaluate((element) => {
    return element.getBoundingClientRect().top
  })
  expect(mainTop).toBeGreaterThanOrEqual(header.bottom - 1)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(250)

  const scrolledHeader = await getHeaderMetrics(page)
  expect(scrolledHeader.position).toBe("fixed")
  expect(scrolledHeader.top).toBeGreaterThanOrEqual(0)
  expect(scrolledHeader.top).toBeLessThan(2)

  const bottomHit = await page.evaluate(() => {
    const element = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      window.innerHeight - 2
    )
    const chain: Array<{ tag: string; className: string; background: string }> = []
    let current = element instanceof HTMLElement ? element : null

    while (current && chain.length < 5) {
      chain.push({
        tag: current.tagName,
        className: String(current.className),
        background: window.getComputedStyle(current).backgroundColor
      })
      current = current.parentElement
    }

    return chain
  })

  expect(bottomHit.length).toBeGreaterThan(0)
  expect(bottomHit[0].tag).not.toBe("HTML")
  expect(
    bottomHit.some((item) =>
      /pageArea|main|layout|market|pool|card/i.test(item.className)
    )
  ).toBe(true)

  const backgrounds = await page.evaluate(() => ({
    html: window.getComputedStyle(document.documentElement).backgroundColor,
    body: window.getComputedStyle(document.body).backgroundColor
  }))
  expect(backgrounds.html).not.toBe("rgba(0, 0, 0, 0)")
  expect(backgrounds.body).not.toBe("rgba(0, 0, 0, 0)")
})

test("mobile connection remains pending through the Keplr handoff and preserves a delayed refusal", async ({ page }) => {
  await page.route("**/src/app/wallet/WalletRuntimeProvider.tsx*", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      const published = new WeakSet();
      const address = "terra1syntheticmobileaccount";
      const expiry = Math.floor(Date.now()/1000) + 10000;
      const wallet = {
        walletName: "keplr-mobile", walletPrettyName: "Keplr Mobile",
        client: { keplr: {}, pairing: {topic:"a", expiry}, signClient:{
          session:{getAll:()=>[{topic:"approved", pairingTopic:"a", expiry,
            peer:{metadata:{name:"Keplr"}}, namespaces:{cosmos:{accounts:["cosmos:columbus-5:"+address]}}}]}
        }},
        connect() {
          window.__pairCount=(window.__pairCount || 0)+1;
          wallet.isWalletRejected=false;
          return new Promise(resolve => {
            window.__completeKeplr = accept => {
              wallet.isWalletRejected=!accept;
              wallet.address=accept ? address : undefined;
              resolve();
            };
          });
        }
      };
      export default function Runtime({publishRuntime}) {
        if (!published.has(publishRuntime)) {
          published.add(publishRuntime);
          queueMicrotask(()=>publishRuntime({chainKey:"lunc",chain:{
            walletRepo:{getWallet:()=>wallet,wallets:[wallet]}
          }}));
        }
        return null;
      }`
  }))
  await page.goto("/")
  await page.getByRole("button", { name: "Connect", exact: true }).click()
  const connector = page.getByRole("button", { name: /Keplr Mobile/ })
  await connector.click()
  await expect(page.getByRole("status").filter({ hasText: "Waiting for Keplr" })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__pairCount"))).toBe(1)
  // Leave the approval outstanding well past the former 90 ms premature unlock.
  await page.waitForTimeout(300)
  await expect(connector).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem("burrito:preferred-wallet"))).toBeNull()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: /Connect/i }).first().click()
  await expect(connector).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, "__completeKeplr")(false))
  await expect(page.getByRole("alert")).toContainText("declined")
  await expect(connector).toBeEnabled()
  expect(await page.evaluate(() => Reflect.get(window, "__pairCount"))).toBe(1)
  await connector.click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__pairCount"))).toBe(2)
  await page.getByRole("button", { name: "Stop waiting in this browser" }).click()
  await expect(connector).toBeEnabled()
  await page.evaluate(() => Reflect.get(window, "__completeKeplr")(true))
  await expect(page.getByText("Connected", { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem("burrito:preferred-wallet"))).toBeNull()
  await connector.click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__pairCount"))).toBe(3)
  await page.evaluate(() => Reflect.get(window, "__completeKeplr")(true))
  await expect(page.getByText("Connected", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("burrito:preferred-wallet"))).toBe("keplr-mobile")
})

test("mobile reload verifies the actual Keplr session rather than trusting an SDK cached account", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("burrito:preferred-wallet", "keplr-mobile")
    localStorage.setItem("cosmos-kit@2:core//current-wallet", "keplr-mobile")
  })
  await page.route("**/src/app/wallet/WalletRuntimeProvider.tsx*", route=>route.fulfill({
    contentType:"application/javascript",
    body:`
      const published = new WeakSet();
      const address = "terra1actualsessionaccount";
      const expiry = Math.floor(Date.now()/1000) + 10000;
      const cached = "terra1oldcachedaddress";
      const wallet={walletName:"keplr-mobile",walletPrettyName:"Keplr Mobile",
        address:cached, connect(){throw Error("Passive restore must not pair")}};
      const session={topic:"s",pairingTopic:"p",expiry,peer:{metadata:{name:"Keplr"}},
        namespaces:{cosmos:{accounts:["cosmos:columbus-5:"+address]}}};
      export default function Runtime({publishRuntime}) {
        if(!published.has(publishRuntime)) {
          published.add(publishRuntime);
          // Stale address published before the real client has initialized.
          queueMicrotask(()=>publishRuntime({chainKey:"lunc",chain:{
            walletRepo:{getWallet:()=>wallet,wallets:[wallet]},currentWallet:wallet,
            isWalletConnected:true,address:cached
          }}));
          setTimeout(()=>wallet.client={pairing:{topic:"p",expiry},
            initSignClient:async function() { this.signClient={session:{getAll:()=>window.__sessionLive?[session]:[]}} },
            initKeplrWCClient:function(){ this.keplr={} }
          },150);
        }
        return null;
      }`
  }))
  await page.goto("/privacy")
  const connectButton=page.getByRole("button", {name:"Connect", exact:true}).first()
  await connectButton.click()
  await expect(page.getByRole("button", {name:/Keplr Mobile/})).toBeEnabled()
  await page.waitForTimeout(500)
  await expect(page.getByText("Connected",{exact:true})).toHaveCount(0)
  await page.evaluate(()=>{ Reflect.set(window, "__sessionLive", true); window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")) })
  await expect(page.getByText("Connected",{exact:true})).toBeVisible()
  await expect(page.getByRole("link", { name: "View account address" })).toHaveAttribute("href", /terra1actualsessionaccount$/)
  await expect(page.getByRole("link", { name: "View account address" })).not.toHaveAttribute("href", /terra1oldcachedaddress/)
})
