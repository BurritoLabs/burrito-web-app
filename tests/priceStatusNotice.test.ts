import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { APP_CHAINS } from "../src/app/appChains"
import { AppChainContext } from "../src/app/appChainContext"
import PriceStatusNotice from "../src/app/feedback/PriceStatusNotice"
import type { PriceMap } from "../src/app/data/prices"

const classicPrices = (asOf: number, stale = false): PriceMap => ({
  lunc: { usd: 1 },
  ustc: { usd: 1 },
  _meta: { asOf, stale }
})

describe("price status notice UI", () => {
  const renderNotice = async (
    data?: PriceMap,
    withError = false,
    chainKey: "lunc" | "luna" = "lunc"
  ) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const chain = APP_CHAINS[chainKey]
    const queryKey = ["prices", chain.chainId]
    if (withError) {
      await client.fetchQuery({
        queryKey,
        queryFn: async () => { throw new Error("Price provider unavailable") },
        retry: false
      }).catch(() => undefined)
    } else if (data) {
      client.setQueryData(queryKey, data)
    }
    const context = {
      chainKey,
      chain,
      setChainKey: () => undefined
    }
    return renderToStaticMarkup(createElement(
      QueryClientProvider,
      { client },
      createElement(
        AppChainContext.Provider,
        { value: context },
        createElement(PriceStatusNotice)
      )
    ))
  }

  it("renders a compact accessible notice with timestamp and retry for provider-stale data", async () => {
    const asOf = Date.now() - 30_000
    const markup = await renderNotice({ ...classicPrices(asOf, true), luna: { usd: 1 } })
    expect(markup).toContain('role="status"')
    expect(markup).toContain("Price estimates are delayed.")
    expect(markup).toContain("Last updated")
    expect(markup).toContain("not execution quotes")
    expect(markup).toContain(">Retry</button>")
  })

  it("shows a retained-data warning once data reaches five minutes old", async () => {
    const asOf = Date.now() - (5 * 60 * 1000)
    const markup = await renderNotice(classicPrices(asOf))
    expect(markup).toContain('role="status"')
    expect(markup).toContain("Last updated")
  })

  it("keeps the notice hidden for fresh cached data and pending state", async () => {
    const freshMarkup = await renderNotice(classicPrices(Date.now()))
    expect(freshMarkup).not.toContain('role="status"')
    expect(await renderNotice()).not.toContain('role="status"')
  })

  it("checks active-chain price requirements rather than treating unrelated omissions as stale", async () => {
    const asOf = Date.now()
    const missingLunc = await renderNotice({
      luna: { usd: 1 },
      ustc: { usd: 1 },
      _meta: { asOf, stale: false }
    })
    expect(missingLunc).toContain("Price estimates are unavailable.")

    const classicWithoutLuna = await renderNotice(classicPrices(asOf))
    expect(classicWithoutLuna).not.toContain('role="status"')

    const lunaNativeOnly = await renderNotice({
      luna: { usd: 1 },
      _meta: { asOf, stale: false }
    }, false, "luna")
    expect(lunaNativeOnly).not.toContain('role="status"')
  })

  it("uses the retained source timestamp when React Query's update time is recent", async () => {
    const asOf = Date.now() - (5 * 60 * 1000)
    const markup = await renderNotice(classicPrices(asOf))
    expect(markup).toContain('role="status"')
    expect(markup).toContain("Last updated")
  })

  it("renders unavailable copy and Retry when the price query failed without data", async () => {
    const markup = await renderNotice(undefined, true)
    expect(markup).toContain("Price estimates are unavailable.")
    expect(markup).toContain("Token balances are unchanged.")
    expect(markup).toContain("not execution quotes")
    expect(markup).toContain(">Retry</button>")
  })
})
