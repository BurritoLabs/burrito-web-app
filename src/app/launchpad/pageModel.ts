import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx"
import { CLASSIC_DENOMS } from "../chain"
import {
  LAUNCHPAD_CREATION_FEE_MICRO,
  LAUNCHPAD_FEE_RECIPIENT
} from "../config/launchpadConfig"
import { sanitizeAssetIconUrl } from "../utils/assetIcons"
import {
  formatBaseUnitsToTokenAmount,
  parseTokenAmountToBaseUnits
} from "./cw20"
import type { TerraswapPairInfo } from "./pool"
import type { LaunchRegistryLaunch } from "./registry"

export type LaunchTab = "create" | "explore" | "manage"
export type CreateStep = "token" | "launch"
export type LaunchFilter = "all" | "live" | "pending" | "ended" | "risk"
export type LaunchSort = "newest" | "oldest" | "unlockSoon" | "unlockLong" | "risk"
export type LaunchMode = "launchpad" | "cw20"
export type ManageSection = "pool" | "lock" | "listing" | "distribution"

export const CW20_SYMBOL_PATTERN = /^[A-Z-]{3,12}$/
export const TERRA_TOKEN_DECIMALS = 6
export const TERRA_TOKEN_DECIMALS_LABEL = String(TERRA_TOKEN_DECIMALS)

export type OwnerLaunchRecord = {
  id: string
  symbol: string
  name: string
  pair: string
  liquidity: string
  lockExpiry: string
  infoStatus: string
  ownerStatus: string
  mode: string
  contractAddress?: string
  txHash?: string
  decimals?: number
  totalSupply?: string
  website?: string
  xProfile?: string
  description?: string
  logoUrl?: string
  pairAddress?: string
  liquidityToken?: string
  pairTxHash?: string
  liquidityTxHash?: string
  liquidityWithdrawTxHash?: string
  distributionTxHash?: string
  lpLockId?: string
  lpLockTxHash?: string
  lpUnlockAt?: string
  lpLockUpdateTxHash?: string
  lpWithdrawTxHash?: string
  registryLaunchId?: string
  registryTxHash?: string
  registryUpdateTxHash?: string
  registryStatus?: "live" | "hidden"
  registryStatusTxHash?: string
  publishedAt?: string
  createdAt?: string
  plannedTokenAmount?: string
  plannedLuncAmount?: string
  plannedLockDays?: string
}

export type Cw20TokenInfo = {
  name?: string
  symbol?: string
  decimals?: number
  total_supply?: string
}

export type PairLookupState = {
  status: "idle" | "loading" | "found" | "missing" | "error"
  pair?: TerraswapPairInfo | null
  error?: string
}

export type TokenInfoLookupState = {
  status: "idle" | "loading" | "found" | "error"
  info?: Cw20TokenInfo
  error?: string
}

export type TokenBalanceLookupState = {
  status: "idle" | "loading" | "found" | "error"
  balance?: string
  error?: string
}

export type Cw20BalanceResponse = {
  balance?: string
}

export type Cw20DistributionTransfer = {
  recipient: string
  amount: string
  displayAmount: string
}

export type DraftLaunch = {
  mode: LaunchMode
  name: string
  symbol: string
  supply: string
  decimals: string
  tokenForPoolPercent: string
  luncLiquidity: string
  lockDays: string
  website: string
  xProfile: string
  description: string
  logoUrl: string
}

export type LaunchCardItem = {
  id: string
  symbol: string
  name: string
  pair: string
  state: Exclude<LaunchFilter, "all">
  status: string
  liquidity: string
  lock: string
  creator: string
  risk: string
  progress: number
  tokenContract?: string
  pairContract?: string
  registryLaunchId?: number
  lpLockId?: string
  website?: string | null
  xProfile?: string | null
  description?: string | null
  logoUrl?: string | null
  createdAt?: number
  unlockTime?: number
  lockedLpAmount?: string
  lpWithdrawn?: boolean
  sample?: boolean
}

export type OwnerNextAction = {
  title: string
  text: string
  actionLabel?: string
  targetId?: string
}

export const initialDraft: DraftLaunch = {
  mode: "launchpad",
  name: "",
  symbol: "",
  supply: "1000000000",
  decimals: TERRA_TOKEN_DECIMALS_LABEL,
  tokenForPoolPercent: "60",
  luncLiquidity: "10000000",
  lockDays: "90",
  website: "",
  xProfile: "",
  description: "",
  logoUrl: ""
}

export const DRAFT_STORAGE_KEY = "burrito.launchpad.draft.v1"
export const CREATED_LAUNCHES_STORAGE_KEY = "burrito.launchpad.created.v1"

export const tabs: Array<{ id: LaunchTab; label: string }> = [
  { id: "create", label: "Create" },
  { id: "explore", label: "Explore" },
  { id: "manage", label: "Manage" }
]

export const normalizeLaunchTab = (value: string | null): LaunchTab | null => {
  if (value === "create" || value === "explore" || value === "manage") {
    return value
  }
  return null
}

export const getLaunchpadDeepLink = (launchId: string) => {
  const query = `tab=explore&launch=${encodeURIComponent(launchId)}`
  if (typeof window === "undefined") return `/launchpad?${query}`
  return `${window.location.origin}/launchpad?${query}`
}

export const getLaunchpadMarketPath = (pairContract: string) =>
  `/market/pair/terraswap/${encodeURIComponent(pairContract)}?from=launchpad`

export const isLuncPairLabel = (pair: string) => /\/\s*LUNC$/i.test(pair.trim())

export const createSteps: Array<{ id: CreateStep; label: string; eyebrow: string }> = [
  { id: "token", label: "Token", eyebrow: "01" },
  { id: "launch", label: "Launch", eyebrow: "02" }
]

export const modeOptions: Array<{
  id: LaunchMode
  title: string
  label: string
}> = [
  {
    id: "launchpad",
    title: "Launch with pool",
    label: "Recommended"
  },
  {
    id: "cw20",
    title: "CW20 only",
    label: "Advanced"
  }
]

export const launchFilters: Array<{ id: LaunchFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "ended", label: "Ended" },
  { id: "risk", label: "Needs info" }
]

export const launchSortOptions: Array<{ id: LaunchSort; label: string }> = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "unlockSoon", label: "Unlock soon" },
  { id: "unlockLong", label: "Longest lock" },
  { id: "risk", label: "Needs info first" }
]

export const launchRiskRank = (launch: LaunchCardItem) => {
  if (launch.state === "risk") return 0
  if (launch.state === "pending") return 1
  if (launch.state === "live") return 2
  return 3
}

export const getManageSectionFromTarget = (
  targetId?: string
): ManageSection | null => {
  if (targetId === "launchpad-distribution") return "distribution"
  if (targetId === "launchpad-lock") return "lock"
  if (targetId === "launchpad-listing") return "listing"
  if (targetId === "launchpad-pool") return "pool"
  return null
}

export const sampleLaunches: LaunchCardItem[] = [
  {
    id: "sample-taco",
    symbol: "TACO",
    name: "Taco Protocol",
    pair: "TACO / LUNC",
    state: "live",
    status: "Trading live",
    liquidity: "$42,000",
    lock: "90 days",
    creator: "terra1...8q5m",
    risk: "Open launch",
    progress: 100,
    sample: true
  },
  {
    id: "sample-salsa",
    symbol: "SALSA",
    name: "Salsa Finance",
    pair: "SALSA / LUNC",
    state: "pending",
    status: "Pending launch",
    liquidity: "$18,400",
    lock: "180 days",
    creator: "terra1...p9dz",
    risk: "Waiting for initial LP",
    progress: 72,
    sample: true
  },
  {
    id: "sample-bean",
    symbol: "BEAN",
    name: "Bean Market",
    pair: "BEAN / LUNC",
    state: "ended",
    status: "Initial launch ended",
    liquidity: "$76,200",
    lock: "365 days",
    creator: "terra1...m2qh",
    risk: "Long LP lock",
    progress: 100,
    sample: true
  },
  {
    id: "sample-churro",
    symbol: "CHURRO",
    name: "Churro Labs",
    pair: "CHURRO / LUNC",
    state: "risk",
    status: "Needs review",
    liquidity: "$9,300",
    lock: "45 days",
    creator: "terra1...0v7k",
    risk: "Low liquidity",
    progress: 38,
    sample: true
  }
]

export const ownerLaunches: OwnerLaunchRecord[] = []

export const loadStoredDraft = () => {
  if (typeof window === "undefined") return initialDraft
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return initialDraft
    const parsed = JSON.parse(raw) as Partial<DraftLaunch>
    return {
      ...initialDraft,
      ...parsed,
      decimals: TERRA_TOKEN_DECIMALS_LABEL
    }
  } catch {
    return initialDraft
  }
}

export const loadCreatedLaunches = (): OwnerLaunchRecord[] => {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CREATED_LAUNCHES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is OwnerLaunchRecord => {
        if (!item || typeof item !== "object") return false
        const record = item as Partial<OwnerLaunchRecord>
        return Boolean(record.id && record.symbol && record.name)
      })
      .slice(0, 25)
  } catch {
    return []
  }
}

export const saveCreatedLaunches = (records: OwnerLaunchRecord[]) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      CREATED_LAUNCHES_STORAGE_KEY,
      JSON.stringify(records.slice(0, 25))
    )
  } catch {
    // Local creator history is a convenience layer.
  }
}

export const toNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, "").trim())
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatNumber = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits
  }).format(value)

export const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value)

export const formatPrice = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  if (value < 0.000001) return value.toExponential(3)
  if (value < 1) return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
  return formatNumber(value, 6)
}

export const formatDateTime = (value: string | number | Date) =>
  new Date(value).toLocaleString()

export const buildLaunchpadCreationFeeMessage = (sender: string) => ({
  typeUrl: "/cosmos.bank.v1beta1.MsgSend",
  value: MsgSend.fromPartial({
    fromAddress: sender,
    toAddress: LAUNCHPAD_FEE_RECIPIENT,
    amount: [
      {
        denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        amount: LAUNCHPAD_CREATION_FEE_MICRO.toString()
      }
    ]
  })
})

export const normalizeOptionalHttpUrl = (value: string, field: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error()
    }
    return url.toString()
  } catch {
    throw new Error(`${field} must be a full http:// or https:// URL.`)
  }
}

export const normalizeOptionalImageUrl = (value: string) => {
  const normalized = normalizeOptionalHttpUrl(value, "Logo URL")
  if (!normalized) return ""
  const sanitized = sanitizeAssetIconUrl(normalized)
  if (!sanitized) {
    throw new Error(
      "Logo URL must point to a public image file, IPFS image, or supported image endpoint."
    )
  }
  return sanitized
}

export const normalizeOptionalXProfile = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const handle = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed
  if (/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    return `https://x.com/${handle}`
  }
  const normalized = normalizeOptionalHttpUrl(trimmed, "X profile")
  const host = new URL(normalized).hostname.replace(/^www\./, "")
  if (host !== "x.com" && host !== "twitter.com") {
    throw new Error("X profile must be an x.com or twitter.com profile URL.")
  }
  return normalized
}

const TERRA_ADDRESS_PATTERN = /^terra1[0-9a-z]{38,80}$/

export const parseDistributionTransfers = (
  value: string,
  decimals: number,
  symbol: string
) => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []
  if (lines.length > 50) {
    throw new Error("Distribution supports up to 50 recipients per transaction.")
  }

  return lines.map<Cw20DistributionTransfer>((line, index) => {
    const lineNumber = index + 1
    const parts = line.split(/[\s,]+/).filter(Boolean)
    if (parts.length !== 2) {
      throw new Error(`Line ${lineNumber}: use "terra1... amount".`)
    }

    const [recipient, amountValue] = parts
    if (!TERRA_ADDRESS_PATTERN.test(recipient)) {
      throw new Error(`Line ${lineNumber}: recipient must be a terra1 address.`)
    }

    return {
      recipient,
      amount: parseTokenAmountToBaseUnits(
        amountValue,
        decimals,
        `${symbol} amount on line ${lineNumber}`
      ),
      displayAmount: amountValue
    }
  })
}

export const getDistributionTotalAmount = (
  transfers: Cw20DistributionTransfer[],
  decimals: number
) => {
  const total = transfers.reduce((sum, transfer) => {
    try {
      return sum + BigInt(transfer.amount)
    } catch {
      return sum
    }
  }, 0n)
  return formatBaseUnitsToTokenAmount(total.toString(), decimals, 6)
}

export const buildOwnerRecordFromRegistryLaunch = (
  launch: LaunchRegistryLaunch,
  tokenInfo?: Cw20TokenInfo | null
): OwnerLaunchRecord => {
  const symbol = (
    launch.metadata?.symbol ||
    tokenInfo?.symbol ||
    "TOKEN"
  ).toUpperCase()
  const name = launch.metadata?.name || tokenInfo?.name || symbol
  const unlockAt = new Date(launch.lp_unlock_time * 1000).toISOString()
  const createdAt = launch.created_at
    ? new Date(launch.created_at * 1000).toISOString()
    : new Date().toISOString()
  const updatedAt = launch.updated_at
    ? new Date(launch.updated_at * 1000).toISOString()
    : createdAt

  return {
    id: launch.token_contract,
    symbol,
    name,
    pair: `${symbol} / LUNC`,
    liquidity: "On-chain LP",
    lockExpiry: formatDateTime(unlockAt),
    infoStatus: "Published",
    ownerStatus:
      launch.status === "hidden" ? "Listing hidden" : "Launch published",
    mode: "Published launch",
    contractAddress: launch.token_contract,
    decimals: tokenInfo?.decimals,
    totalSupply: tokenInfo?.total_supply,
    website: launch.metadata?.website ?? "",
    xProfile: launch.metadata?.x_profile ?? "",
    description: launch.metadata?.description ?? "",
    pairAddress: launch.pair_contract,
    liquidityToken: launch.lp_token,
    lpLockId: launch.lp_lock_id,
    lpUnlockAt: unlockAt,
    registryLaunchId: String(launch.id),
    registryStatus: launch.status,
    publishedAt: updatedAt,
    createdAt
  }
}

export const mergeRecoveredOwnerRecord = (
  existing: OwnerLaunchRecord | undefined,
  recovered: OwnerLaunchRecord
): OwnerLaunchRecord => {
  if (!existing) return recovered
  return {
    ...existing,
    ...recovered,
    txHash: existing.txHash,
    pairTxHash: existing.pairTxHash,
    liquidityTxHash: existing.liquidityTxHash,
    liquidityWithdrawTxHash: existing.liquidityWithdrawTxHash,
    lpLockTxHash: existing.lpLockTxHash,
    lpWithdrawTxHash: existing.lpWithdrawTxHash,
    registryTxHash: existing.registryTxHash,
    registryUpdateTxHash: existing.registryUpdateTxHash,
    registryStatusTxHash: existing.registryStatusTxHash,
    logoUrl: existing.logoUrl ?? recovered.logoUrl
  }
}
