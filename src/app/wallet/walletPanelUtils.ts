import { CLASSIC_DENOMS } from "../chain"
import type { WalletAssetRow } from "./useWalletAssets"

export type SelectedAsset = {
  symbol: string
  name: string
  denom: string
  decimals: number
}

export type SendAsset = SelectedAsset & {
  kind: WalletAssetRow["kind"]
  amount: string
}

export type RecentRecipientEntry = {
  address: string
  memoUsed: boolean
  assetDenom: string
  assetSymbol: string
  lastUsedAt: number
}

export type WalletPanelView = "wallet" | "send" | "receive" | "asset"

export const GAS_PRICE_MICRO_LUNC = 28.325
export const FALLBACK_SEND_GAS_NATIVE = 90_000
export const FALLBACK_SEND_GAS_CW20 = 140_000
export const RECENT_RECIPIENT_LIMIT = 4
export const DEFAULT_SEND_ASSET: SelectedAsset = {
  symbol: "LUNC",
  name: "Terra Classic",
  denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
  decimals: CLASSIC_DENOMS.lunc.coinDecimals
}
export const TERRA_ADDRESS_PATTERN = /^terra1[0-9a-z]{38}$/

export const encodeJsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value))

export const sanitizeAmount = (value: string) => {
  let next = value.replace(/,/g, "").replace(/[^\d.]/g, "")
  const firstDot = next.indexOf(".")
  if (firstDot >= 0) {
    next =
      next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "")
  }
  return next
}

export const parseBigInt = (value?: string) => {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

export const toMicroAmount = (value: string, decimals = 6) => {
  const cleaned = sanitizeAmount(value).trim()
  if (!cleaned) return 0n
  const [wholePartRaw, fracPartRaw = ""] = cleaned.split(".")
  const wholePart = wholePartRaw || "0"
  if (!/^\d+$/.test(wholePart) || (fracPartRaw && !/^\d+$/.test(fracPartRaw))) {
    return 0n
  }
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0")
  const merged = `${wholePart}${fracPart}`.replace(/^0+/, "") || "0"
  return parseBigInt(merged)
}

export const fromMicroAmount = (value: bigint, decimals = 6) => {
  if (value <= 0n) return "0"
  if (decimals <= 0) return value.toString()
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

export const toSelectedAsset = (
  asset: Pick<WalletAssetRow, "denom" | "symbol" | "name" | "decimals">
): SelectedAsset => ({
  symbol: asset.symbol,
  name: asset.name,
  denom: asset.denom,
  decimals: asset.decimals
})

export const formatShortAddress = (value: string) => {
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

export const getRecentRecipientsStorageKey = (address: string) =>
  `burritoRecentRecipients:${address}:classic`
