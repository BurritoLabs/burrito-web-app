import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { formatWalletAmount, walletUnitAmount, walletValueFromSwaprate } from "../src/app/wallet/walletAssetMath"
import { fromMicroAmount, toMicroAmount } from "../src/app/wallet/walletPanelUtils"
import { useWalletAssets } from "../src/app/wallet/useWalletAssets"
import type { WalletAssetRow } from "../src/app/wallet/useWalletAssets"
import { CoinsSection, TokensSection } from "../src/pages/wallet/WalletAssetSections"
import { useWalletAssetVisibility } from "../src/app/wallet/useWalletAssetVisibility"

const fixture = vi.hoisted(() => ({
  balances: [] as Array<{ denom: string; amount: string }>,
  native: {} as Record<string, { symbol: string; decimals?: number }>,
  ibc: {} as Record<string, { symbol: string; decimals?: number; base_denom: string }>,
  cw20: [] as Array<{ address: string; symbol: string; balance: string; decimals?: number }>,
  swaps: [] as Array<{ denom: string; swaprate: string }>,
  dexMetas: [] as Array<{ key: string; decimals: number }>,
  ustcUsd: 0.5 as number | undefined,
  dex: {} as Record<string, { quoteDenom: string; priceInQuote: number }>
}))

vi.mock("../src/app/appChainContext", () => ({ useAppChain: () => ({
  chainKey: "lunc", chain: { chainId: "fixture", displayDenom: "LUNC", name: "Terra Classic" }
}) }))
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => {
  const data = queryKey[0] === "prices" ? { lunc: { usd: 0.1 }, ustc: { usd: fixture.ustcUsd } }
    : queryKey[0] === "fx-rates" ? { MNT: 2, TWD: 3 }
    : queryKey[0] === "swaprates" ? fixture.swaps
    : queryKey[0] === "wallet" && queryKey[2] === "balances" ? fixture.balances : []
  return { data, isFetching: false, isError: false }
} }))
vi.mock("../src/app/data/classic", () => ({
  fetchBalances: vi.fn(), fetchFxRates: vi.fn(), fetchPrices: vi.fn(), fetchSwapRates: vi.fn(),
  getCachedNativeBalances: vi.fn(), cacheNativeBalances: vi.fn(), getCachedFxRates: vi.fn(), getCachedPrices: vi.fn()
}))
vi.mock("../src/app/data/cw20", () => ({ useCw20Balances: () => ({ data: fixture.cw20 }) }))
vi.mock("../src/app/data/terraAssets", () => ({
  useCw20Whitelist: () => ({ data: {} }), useResolvedCw20Whitelist: () => ({ data: {} }),
  useResolvedNativeWhitelist: () => ({ data: fixture.native }), useResolvedIbcWhitelist: () => ({ data: fixture.ibc })
}))
vi.mock("../src/app/data/dexPrices", () => ({
  useDexEstimatedPrices: (metas: typeof fixture.dexMetas) => { fixture.dexMetas = metas; return { data: fixture.dex } },
  useDirectAnchorDexPrices: () => ({ data: {} })
}))
vi.mock("../src/app/data/market", () => ({ fetchMarketDexPairs: vi.fn(), fetchMarketPools: vi.fn() }))
vi.mock("../src/app/launchpad/registry", () => ({ fetchLaunchRegistryLaunches: vi.fn(), isLaunchRegistryConfigured: () => false }))

const rows = () => {
  let result: WalletAssetRow[] = []
  const Probe = () => { result = useWalletAssets("terra1fixture").assetRows; return null }
  renderToStaticMarkup(createElement(Probe))
  return result
}

beforeEach(() => {
  fixture.balances = []; fixture.native = {}; fixture.ibc = {}; fixture.cw20 = []
  fixture.swaps = []; fixture.dex = {}; fixture.dexMetas = []
  fixture.ustcUsd = 0.5
})

describe("production wallet financial accuracy", () => {
  it.each([0, 8])("uses verified %i-decimal native/IBC/CW20 units in DEX valuation, not unsupported oracle rates", decimals => {
    const amount = `2${"0".repeat(decimals)}`
    fixture.balances = [{ denom: "utest", amount }, { denom: "ibc/ABC", amount }]
    fixture.native.utest = { symbol: "TEST", decimals }
    fixture.ibc.ABC = { symbol: "IBC", decimals, base_denom: "utest" }
    fixture.cw20 = [{ address: "terra1cw", symbol: "CW", decimals, balance: amount }]
    fixture.swaps = [{ denom: "utest", swaprate: "2" }, { denom: "ibc/ABC", swaprate: "2" }]
    fixture.dex.terra1cw = { quoteDenom: "uusd", priceInQuote: 4 }
    fixture.dex.utest = { quoteDenom: "uusd", priceInQuote: 4 }
    fixture.dex["ibc/ABC"] = { quoteDenom: "uusd", priceInQuote: 4 }
    const actual = rows()
    expect(actual.find(row => row.denom === "utest")).toMatchObject({ decimals, value: 4, price: 2 })
    expect(actual.find(row => row.denom === "ibc/ABC")).toMatchObject({ decimals, value: 4, price: 2 })
    expect(actual.find(row => row.denom === "terra1cw")).toMatchObject({ decimals, value: 4, price: 2 })
    expect(fixture.dexMetas).toEqual(expect.arrayContaining([{ key: "utest", decimals }, { key: "ibc/ABC", decimals }]))
  })

  it.each([undefined, -1, 1.5, NaN, Infinity, 309, "8"])("never invents units or prices for malformed precision %s", precision => {
    const decimals = precision as number | undefined
    fixture.balances = [{ denom: "utest", amount: "200000000" }, { denom: "ibc/ABC", amount: "200000000" }]
    fixture.native.utest = { symbol: "TEST", decimals }
    fixture.ibc.ABC = { symbol: "IBC", base_denom: "umnt", decimals }
    fixture.cw20 = [{ address: "terra1cw", symbol: "LUNC", balance: "200000000", decimals }]
    fixture.swaps = [{ denom: "utest", swaprate: "2" }, { denom: "ibc/ABC", swaprate: "2" }]
    fixture.dex.terra1cw = { quoteDenom: "uusd", priceInQuote: 4 }
    for (const row of rows().filter(row => ["utest", "ibc/ABC", "terra1cw"].includes(row.denom))) {
      expect(row.decimals).toBeUndefined(); expect(row.value).toBeUndefined(); expect(row.price).toBeUndefined()
      expect(formatWalletAmount(row.amount, row.decimals)).toBe("200000000 raw units (precision unavailable)")
    }
    expect(fixture.dexMetas).toEqual([])
    expect(toMicroAmount("2", decimals)).toBe(0n)
    expect(fromMicroAmount(200000000n, decimals)).toBe("")
  })

  it.each(["LUNC", "USTC"])("does not value a CW20 named %s as a native asset", symbol => {
    fixture.cw20 = [{ address: "terra1impostor", symbol, balance: "200000000", decimals: 8 }]
    const row = rows().find(asset => asset.denom === "terra1impostor")!
    expect(row.value).toBeUndefined(); expect(row.price).toBeUndefined()
    fixture.dex.terra1impostor = { quoteDenom: "uusd", priceInQuote: 4 }
    expect(rows().find(asset => asset.denom === "terra1impostor")).toMatchObject({ value: 4, price: 2 })
  })

  it("scales FX fallback with actual precision", () => {
    fixture.balances = [{ denom: "umnt", amount: "200000000" }]
    fixture.native.umnt = { symbol: "MNTC", decimals: 8 }
    expect(rows().find(row => row.denom === "umnt")).toMatchObject({ value: 2, price: 1 })
  })

  it("shows raw balances and disables Send/Swap in actual wallet sections", () => {
    const row: WalletAssetRow = { kind: "cw20", denom: "terra1unknown", symbol: "UNKNOWN", name: "Unknown", amount: "123", chainCount: 1, whitelisted: true, isBuyable: false, iconCandidates: [] }
    const callbacks = { onSendAsset: vi.fn(), onSwapAsset: vi.fn(), onToggle: vi.fn(), onRetry: vi.fn() }
    const common = { ...callbacks, hasAccount: true, isError: false, isLoading: false, hideLowBalance: false, rows: [row] }
    for (const markup of [
      renderToStaticMarkup(createElement(TokensSection, common)),
      renderToStaticMarkup(createElement(CoinsSection, { ...common, showWarning: false, onBuyAsset: vi.fn() }))
    ]) {
      expect(markup).toContain("123 raw units (precision unavailable)")
      expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
      expect(markup).not.toContain("$0")
    }
  })

  it("preserves zero-decimal send/max and large valid raw integers without overflow", () => {
    expect(toMicroAmount("23", 0)).toBe(23n)
    expect(fromMicroAmount(23n, 0)).toBe("23")
    expect(walletUnitAmount(`1${"0".repeat(308)}`, 308)).toBe(1)
    expect(formatWalletAmount(`1${"0".repeat(309)}`, 308)).toBe("10")
    expect(walletValueFromSwaprate("2000000", "ukrw", 6, 2, 0.5, true)).toBe(0.5)
    expect(walletValueFromSwaprate("2000000", "ukrw", undefined, 2, 0.5, true)).toBeUndefined()
    expect(walletValueFromSwaprate("2000000", "ukrw", 6, Infinity, 0.5, true)).toBeUndefined()
  })

  it("converts known six-decimal Classic oracle rates using the actual USTC USD quote", () => {
    fixture.balances = [{ denom: "ukrw", amount: "2000000" }]
    fixture.native.ukrw = { symbol: "KRTC", decimals: 6 }
    fixture.swaps = [{ denom: "ukrw", swaprate: "2" }]
    expect(rows().find(row => row.denom === "ukrw")).toMatchObject({ value: 0.5, price: 0.25 })
    fixture.ustcUsd = undefined
    const row = rows().find(row => row.denom === "ukrw")!
    expect(row.value).toBeUndefined(); expect(row.price).toBeUndefined()
  })

  it.each(["factory/custom", "ibc/ABC", "terra1contract"])("does not accept unsupported oracle identity %s even with six decimals", denom => {
    expect(walletValueFromSwaprate("2000000", denom, 6, 2, 0.5, true)).toBeUndefined()
  })

  it.each([0, 8, undefined])("does not assume oracle units for known-denom metadata with precision %s", decimals => {
    fixture.balances = [{ denom: "ukrw", amount: "200000000" }]
    fixture.native.ukrw = { symbol: "KRTC", decimals }
    fixture.swaps = [{ denom: "ukrw", swaprate: "2" }]
    expect(rows().find(row => row.denom === "ukrw")?.value).toBeUndefined()
  })

  it.each(["native", "ibc", "cw20"] as const)("keeps positive unknown-precision %s visible under low-balance filtering", kind => {
    const row: WalletAssetRow = { kind, denom: kind === "ibc" ? "ibc/ABC" : "unknown", symbol: "UNKNOWN", name: "Unknown", amount: "1", chainCount: 1, whitelisted: true, isBuyable: false, iconCandidates: [] }
    let visible: WalletAssetRow[] = []
    const Probe = () => {
      visible = useWalletAssetVisibility({ assetRows: [row], hideLowBalance: true }).visibleAssetRows
      return null
    }
    renderToStaticMarkup(createElement(Probe))
    expect(visible).toEqual([row])
  })
})
