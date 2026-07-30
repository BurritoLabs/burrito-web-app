const DEFAULT_PLATFORM_FEE_BPS = 20n
const MAX_PLATFORM_FEE_BPS = 100n

const parseFeeBps = (value: string | undefined) => {
  const trimmed = value?.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return DEFAULT_PLATFORM_FEE_BPS
  const parsed = BigInt(trimmed)
  if (parsed < 0n || parsed > MAX_PLATFORM_FEE_BPS) {
    return DEFAULT_PLATFORM_FEE_BPS
  }
  return parsed
}

export const GAS_PRICE_MICRO_LUNC = 28.325
export const FALLBACK_GAS_NATIVE_SWAP = 220_000
export const FALLBACK_GAS_CW20_SWAP = 300_000
export const FALLBACK_GAS_NATIVE_FEE = 80_000
export const FALLBACK_GAS_CW20_FEE = 120_000
export const SWAP_GAS_ADJUSTMENT = 1.6
export const SWAP_FALLBACK_GAS_ADJUSTMENT = 1.25
export const SWAP_MEMO = "Swapped via Burrito Swap"
export const PLATFORM_FEE_BPS = parseFeeBps(
  import.meta.env.VITE_SWAP_PLATFORM_FEE_BPS
)
export const DEFAULT_SLIPPAGE_BPS = 50n
export const SLIPPAGE_OPTIONS = [
  { label: "0.1%", bps: 10n },
  { label: "0.5%", bps: 50n },
  { label: "1.0%", bps: 100n }
] as const
