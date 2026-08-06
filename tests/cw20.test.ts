import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fetchCw20Balance,
  includeActiveCw20Contracts
} from "../src/app/data/cw20"
import { setActiveAppChainKey } from "../src/app/activeChain"

const DISCOVERED_CONTRACT =
  "terra1ctvrh09s3q2tgxm88vt6zexle8wcf22qwhxe5qa2wchc9e2ynw3qhvksyl"
const ACCOUNT = "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu"

const originalFetch = globalThis.fetch

afterEach(() => {
  setActiveAppChainKey("lunc")
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe("CW20 wallet discovery", () => {
  it("includes a valid contract previously confirmed to have a balance", () => {
    expect(
      includeActiveCw20Contracts({}, [DISCOVERED_CONTRACT])[DISCOVERED_CONTRACT]
    ).toMatchObject({
      token: DISCOVERED_CONTRACT,
      symbol: "CW20-CTVRH0",
      decimals: 6
    })
  })

  it("preserves trusted registry metadata for discovered contracts", () => {
    const existing = {
      [DISCOVERED_CONTRACT]: {
        token: DISCOVERED_CONTRACT,
        symbol: "BENANCE",
        name: "Benance Governance Token",
        decimals: 8
      }
    }

    expect(
      includeActiveCw20Contracts(existing, [DISCOVERED_CONTRACT])[
        DISCOVERED_CONTRACT
      ]
    ).toEqual(existing[DISCOVERED_CONTRACT])
  })

  it("ignores malformed cached contract candidates", () => {
    expect(includeActiveCw20Contracts({}, ["not-a-contract"])).toEqual({})
  })

  it("queries the Phoenix LCD when Luna is active", async () => {
    const requestedUrls: string[] = []
    setActiveAppChainKey("luna")
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(input.toString())
      return new Response(JSON.stringify({ data: { balance: "42" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    })

    await expect(fetchCw20Balance(ACCOUNT, DISCOVERED_CONTRACT)).resolves.toBe("42")
    expect(requestedUrls[0]).toMatch(
      /^https:\/\/terra-lcd\.publicnode\.com\/cosmwasm\/wasm\/v1\/contract\//
    )
  })
})
