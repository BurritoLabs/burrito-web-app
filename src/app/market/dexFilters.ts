import type { SupportedChainKey } from "../config/chainConfig"

export type MarketDexFilter =
  | "all"
  | "terraswap"
  | "terraport"
  | "astroport"
  | "phoenix"
  | "garuda"
  | "white-whale"
  | "luncswap"
  | "terra-pump"
  | "luncpump"
  | "weso-defi"

export type MarketDexFilterOption = {
  value: MarketDexFilter
  label: string
}

const LUNC_DEX_FILTER_OPTIONS: readonly MarketDexFilterOption[] = [
  { value: "all", label: "All" },
  { value: "terraport", label: "Terraport" },
  { value: "terraswap", label: "Terraswap" },
  { value: "astroport", label: "Astroport" },
  { value: "garuda", label: "Garuda" },
  { value: "white-whale", label: "White Whale" },
  { value: "luncswap", label: "LUNCSwap" },
  { value: "terra-pump", label: "Terra.pump" },
  { value: "luncpump", label: "LUNCPump" },
  { value: "weso-defi", label: "WESO DeFi" }
]

const LUNA_DEX_FILTER_OPTIONS: readonly MarketDexFilterOption[] = [
  { value: "all", label: "All" },
  { value: "astroport", label: "Astroport" },
  { value: "terraswap", label: "Terraswap" },
  { value: "phoenix", label: "Phoenix" },
  { value: "white-whale", label: "White Whale" }
]

const STANDARD_LIQUIDITY_DEX_LABELS = {
  lunc: "Terraswap, Astroport, Terraport, Garuda, and WESO DeFi",
  luna: "Terraswap, Astroport, and Phoenix"
} as const satisfies Record<SupportedChainKey, string>

export const getMarketDexFilterOptions = (chainKey: SupportedChainKey) =>
  chainKey === "luna" ? LUNA_DEX_FILTER_OPTIONS : LUNC_DEX_FILTER_OPTIONS

export const getStandardLiquidityDexLabels = (
  chainKey: SupportedChainKey
) => STANDARD_LIQUIDITY_DEX_LABELS[chainKey]
