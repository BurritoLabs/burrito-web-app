import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchCw20Balance, fetchCw20Balances, getCachedCw20Balances } from "../src/app/data/cw20"
import { fetchWithEndpointFallback } from "../src/app/data/endpointFallback"

vi.mock("../src/app/data/endpointFallback", () => ({ fetchWithEndpointFallback: vi.fn() }))

const ACCOUNT = "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu"
const FIRST = "terra1ctvrh09s3q2tgxm88vt6zexle8wcf22qwhxe5qa2wchc9e2ynw3qhvksyl"
const SECOND = "terra15p8su45k45axng8ue59rl6zph4at27s49u3agr6uqrx3dhcxpg3qt0ekdt"
const SCOPE = { chainId: "cw20-integrity-test", lcd: "https://fixture.invalid" }
const whitelist = {
  [FIRST]: { token: FIRST, symbol: "ONE", decimals: 6 },
  [SECOND]: { token: SECOND, symbol: "TWO", decimals: 8 }
}
const fetchMock = vi.mocked(fetchWithEndpointFallback)
let storage: Map<string, string>
let now = 1_800_000_000_000

beforeEach(() => {
  storage = new Map()
  now = 1_800_000_000_000
  vi.spyOn(Date, "now").mockImplementation(() => now)
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  } })
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("CW20 balance integrity", () => {
  it.each([undefined, null, 0, "-1", "1.5", "1e6", "340282366920938463463374607431768211456"])(
    "does not turn malformed balance %s into a real zero or cache it", async (balance) => {
      fetchMock.mockImplementation(async () => Response.json({ data: { balance } }))
      await expect(fetchCw20Balance(ACCOUNT, FIRST, SCOPE)).rejects.toThrow("Failed to fetch CW20 balance")
      expect(storage.has(`cw20balance-single:v1:${ACCOUNT}:${SCOPE.chainId}:${FIRST}`)).toBe(false)
    }
  )

  it("keeps valid zero and maximum Uint128 as exact strings", async () => {
    for (const balance of ["0", "340282366920938463463374607431768211455"]) {
      fetchMock.mockImplementation(async () => Response.json({ data: { balance } }))
      await expect(fetchCw20Balance(ACCOUNT, FIRST, SCOPE)).resolves.toBe(balance)
    }
  })

  it("retains successful tokens when a peer fails without renewing failed cache timestamps", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: { balance: "42" } }))
    await fetchCw20Balances(ACCOUNT, whitelist, {}, SCOPE)
    const initialTime = now
    const oldSingle = storage.get(`cw20balance-single:v1:${ACCOUNT}:${SCOPE.chainId}:${FIRST}`)
    now += 60_000
    fetchMock.mockImplementation(async (input) => {
      if (input.toString().includes(FIRST)) throw new Error("fixture offline")
      return Response.json({ data: { balance: "99" } })
    })
    const rows = await fetchCw20Balances(ACCOUNT, whitelist, {}, SCOPE)
    expect(rows.find((row) => row.address === SECOND)?.balance).toBe("99")
    expect(rows.find((row) => row.address === FIRST)?.balance).toBe("42")
    expect(storage.get(`cw20balance-single:v1:${ACCOUNT}:${SCOPE.chainId}:${FIRST}`)).toBe(oldSingle)
    expect(getCachedCw20Balances(ACCOUNT, whitelist, SCOPE)?.updatedAt).toBe(initialTime)
    expect(getCachedCw20Balances(ACCOUNT, whitelist, SCOPE)?.data.find((row) => row.address === SECOND)?.balance).toBe("99")
    now += 30 * 60_000
    expect(getCachedCw20Balances(ACCOUNT, whitelist, SCOPE)?.data.some((row) => row.address === FIRST)).not.toBe(true)
  })

  it("makes an entirely failed scan retryable rather than successful empty", async () => {
    fetchMock.mockRejectedValue(new Error("fixture offline"))
    await expect(fetchCw20Balances(ACCOUNT, whitelist, {}, SCOPE)).rejects.toThrow("CW20")
    expect(storage.size).toBe(0)
  })

  it("does not remove a known active contract after a malformed 200 response", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: { balance: "12" } }))
    await fetchCw20Balance(ACCOUNT, FIRST, SCOPE)
    const activeKey = `cw20balance-active:v1:${ACCOUNT}:${SCOPE.chainId}`
    const active = storage.get(activeKey)
    now += 60_000
    fetchMock.mockImplementation(async () => Response.json({ data: {} }))
    await expect(fetchCw20Balance(ACCOUNT, FIRST, SCOPE)).rejects.toThrow()
    expect(storage.get(activeKey)).toBe(active)
  })

  it("reports the actual single-balance cache age when the whitelist changes", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: { balance: "12" } }))
    await fetchCw20Balance(ACCOUNT, FIRST, SCOPE)
    const initialTime = now
    now += 60_000
    expect(getCachedCw20Balances(ACCOUNT, whitelist, SCOPE)?.updatedAt).toBe(initialTime)
    expect(getCachedCw20Balances(ACCOUNT, whitelist, { ...SCOPE, chainId: "other-chain" })).toBeUndefined()
    expect(getCachedCw20Balances("terra1different", whitelist, SCOPE)).toBeUndefined()
  })

  it("prefers a newer complete snapshot when a single-cache write was interrupted", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: { balance: "42" } }))
    await fetchCw20Balances(ACCOUNT, whitelist, {}, SCOPE)
    storage.set(`cw20balance-single:v1:${ACCOUNT}:${SCOPE.chainId}:${FIRST}`,
      JSON.stringify({ ts: now - 60_000, balance: "1" }))
    const cached = getCachedCw20Balances(ACCOUNT, whitelist, SCOPE)
    expect(cached?.data.find((row) => row.address === FIRST)?.balance).toBe("42")
    expect(cached?.updatedAt).toBe(now)
  })
})
