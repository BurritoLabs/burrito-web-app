import type { ChainWalletBase } from "@cosmos-kit/core"
import { describe, expect, it, vi } from "vitest"
import { connectKeplrMobile, restoreKeplrMobileAddress } from "../src/app/wallet/keplrMobileSession"

const chain = "columbus-5"
const expires = Math.floor(Date.now() / 1000) + 10000
const address = "terra1syntheticaccount"
const live = {
  topic: "s", pairingTopic: "p", expiry: expires, peer: { metadata: { name: "Keplr" } },
  namespaces: { cosmos: { accounts: [`cosmos:${chain}:${address}`] } }
}
const sdk = (value: unknown) => value as ChainWalletBase
function store(sessions = [live]) {
  const signClient = { session: { getAll: () => sessions } }
  const client = {
    pairing: {topic:"p", expiry: expires},
    signClient: undefined as typeof signClient | undefined,
    keplr: undefined as unknown,
    initSignClient: vi.fn(async () => { client.signClient = signClient }),
    initKeplrWCClient: vi.fn(() => { client.keplr = {} }),
    initAppUrl: vi.fn(), isMobile: true, redirectHref: "",
    connect: vi.fn(), enable: vi.fn()
  }
  return { client, wallet: sdk({client, address:"stale local account", connect:vi.fn()}) }
}
describe("Keplr Mobile restoration and connection", () => {
  it("opens one read-only client, binds the restored adapter and uses the live account, never cached data", async () => {
    const {client,wallet} = store()
    expect(await Promise.all([1,2].map(()=>restoreKeplrMobileAddress(wallet, chain, ()=>true)))).toEqual([address,address])
    expect(client.initSignClient).toHaveBeenCalledTimes(1)
    expect(client.initKeplrWCClient).toHaveBeenCalledTimes(1)
    expect(client.connect).not.toHaveBeenCalled()
    expect(client.enable).not.toHaveBeenCalled()
    expect(client.initAppUrl).not.toHaveBeenCalled()
    expect(wallet.connect).not.toHaveBeenCalled()
  })
  it.each([
    { ...live, expiry: 1 }, { ...live, pairingTopic: "different" },
    { ...live, peer: { metadata: { name: "Not Keplr" } } },
    { ...live, namespaces:{cosmos:{accounts:[`cosmos:phoenix-1:${address}`]}} }
  ])("fails closed if the SDK would sign with a different or expired last session", async (other) => {
    const {client,wallet} = store([live, other])
    expect(await restoreKeplrMobileAddress(wallet, chain, ()=>true)).toBeUndefined()
    expect(client.initKeplrWCClient).not.toHaveBeenCalled()
  })
  it("never binds an abandoned restoration after relay initialization", async () => {
    const {client,wallet} = store()
    let owned = true
    const pending=restoreKeplrMobileAddress(wallet, chain, ()=>owned)
    owned=false
    expect(await pending).toBeUndefined()
    expect(client.initKeplrWCClient).not.toHaveBeenCalled()
  })
  it("keeps a single pending SDK request and detects a resolved but rejected SDK state", async () => {
    let resolve!: () => void
    const connect = vi.fn(() => new Promise<void>(r=>{resolve=r}))
    const wallet = sdk({connect, isWalletRejected:true})
    const pending=connectKeplrMobile(wallet, chain)
    await expect(connectKeplrMobile(wallet, chain)).rejects.toThrow("already waiting")
    resolve()
    await expect(pending).rejects.toThrow("declined")
    expect(connect).toHaveBeenCalledTimes(1)
  })
})
