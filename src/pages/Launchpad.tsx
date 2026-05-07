import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react"
import { Link } from "react-router-dom"
import PageShell from "./PageShell"
import styles from "./Launchpad.module.css"
import {
  buildCw20InstantiateMessage,
  extractContractAddressFromEvents,
  formatBaseUnitsToTokenAmount,
  LAUNCHPAD_CW20_CODE_ID_LABEL,
  parseTokenAmountToBaseUnits
} from "../app/launchpad/cw20"
import {
  buildCreateTerraswapLuncPairMessage,
  buildIncreaseAllowanceMessage,
  buildProvideTerraswapLiquidityMessage,
  buildWithdrawTerraswapLiquidityMessage,
  fetchTerraswapLuncPair,
  formatSlippageTolerance,
  parseLuncAmountToBaseUnits,
  TERRASWAP_FACTORY_ADDRESS,
  waitForTerraswapLuncPair,
  type TerraswapPairInfo
} from "../app/launchpad/pool"
import {
  buildLockLpMessage,
  buildWithdrawLockedLpMessage,
  extractLpLockIdFromEvents,
  getLpUnlockTimestampSeconds,
  isLpLockerConfigured,
  LAUNCHPAD_LP_LOCKER_ADDRESS,
  parseLpAmountToBaseUnits
} from "../app/launchpad/locker"
import {
  buildRegisterLaunchMessage,
  buildUpdateLaunchMessage,
  extractRegistryLaunchIdFromEvents,
  fetchLaunchRegistryLaunch,
  fetchLaunchRegistryLaunches,
  isLaunchRegistryConfigured,
  LAUNCHPAD_REGISTRY_ADDRESS,
  type LaunchRegistryLaunch
} from "../app/launchpad/registry"
import { useWallet } from "../app/wallet/WalletContext"
import {
  connectClassicSigningClientForConnector,
  getSignerAddressForConnector
} from "../app/wallet/walletAdapters"
import { truncateHash } from "../app/utils/format"
import { fetchContractInfo, queryContractSmart } from "../app/data/classic"

type LaunchTab = "create" | "explore" | "manage"
type CreateStep = "token" | "liquidity" | "safety" | "summary"
type LaunchFilter = "all" | "live" | "pending" | "ended" | "risk"
type LaunchMode = "launchpad" | "cw20"

type OwnerLaunchRecord = {
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
  pairAddress?: string
  liquidityToken?: string
  pairTxHash?: string
  liquidityTxHash?: string
  liquidityWithdrawTxHash?: string
  lpLockId?: string
  lpLockTxHash?: string
  lpUnlockAt?: string
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

type Cw20TokenInfo = {
  name?: string
  symbol?: string
  decimals?: number
  total_supply?: string
}

type PairLookupState = {
  status: "idle" | "loading" | "found" | "missing" | "error"
  pair?: TerraswapPairInfo | null
  error?: string
}

type TokenInfoLookupState = {
  status: "idle" | "loading" | "found" | "error"
  info?: Cw20TokenInfo
  error?: string
}

type TokenBalanceLookupState = {
  status: "idle" | "loading" | "found" | "error"
  balance?: string
  error?: string
}

type Cw20BalanceResponse = {
  balance?: string
}

type DraftLaunch = {
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
}

type LaunchCardItem = {
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
  createdAt?: number
  unlockTime?: number
  sample?: boolean
}

const initialDraft: DraftLaunch = {
  mode: "launchpad",
  name: "",
  symbol: "",
  supply: "1000000000",
  decimals: "6",
  tokenForPoolPercent: "60",
  luncLiquidity: "10000000",
  lockDays: "90",
  website: "",
  xProfile: "",
  description: ""
}

const DRAFT_STORAGE_KEY = "burrito.launchpad.draft.v1"
const CREATED_LAUNCHES_STORAGE_KEY = "burrito.launchpad.created.v1"

const tabs: Array<{ id: LaunchTab; label: string; eyebrow: string }> = [
  { id: "create", label: "Create", eyebrow: "Token + pool" },
  { id: "explore", label: "Explore", eyebrow: "New launches" },
  { id: "manage", label: "Manage", eyebrow: "Owner tools" }
]

const createSteps: Array<{ id: CreateStep; label: string; eyebrow: string }> = [
  { id: "token", label: "Token", eyebrow: "01" },
  { id: "liquidity", label: "Liquidity", eyebrow: "02" },
  { id: "safety", label: "Safety", eyebrow: "03" },
  { id: "summary", label: "Summary", eyebrow: "04" }
]

const modeOptions: Array<{
  id: LaunchMode
  title: string
  label: string
  text: string
}> = [
  {
    id: "launchpad",
    title: "Launch with pool",
    label: "Recommended",
    text: "Create CW20, create Token / LUNC pair, add initial liquidity, then show it in Launchpad."
  },
  {
    id: "cw20",
    title: "CW20 only",
    label: "Advanced",
    text: "Only create the token contract. No pool, no launch listing, no automatic trading route."
  }
]

const launchChecklist = [
  "Fixed-supply CW20 token",
  "Creator address shown publicly",
  "Token / LUNC pool required",
  "Initial LP lock required",
  "Public launch facts shown before trading",
  "No tax, blacklist, or hidden mint controls in V1"
]

const cw20OnlyChecklist = [
  "Creates token contract only",
  "No initial price",
  "No automatic Market listing",
  "No Swap route until a pool exists",
  "Creator must manage distribution manually",
  "Best for utility tokens, tests, or private launches"
]

const launchFilters: Array<{ id: LaunchFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "pending", label: "Pending" },
  { id: "ended", label: "Ended" },
  { id: "risk", label: "Risk flagged" }
]

const sampleLaunches: LaunchCardItem[] = [
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
    status: "Risk flagged",
    liquidity: "$9,300",
    lock: "45 days",
    creator: "terra1...0v7k",
    risk: "Low liquidity",
    progress: 38,
    sample: true
  }
]

const futureOwnerActions = [
  {
    title: "Extend existing lock",
    text: "The current locker creates fixed locks. Extending the same lock should be a later contract upgrade, not a frontend-only promise."
  },
  {
    title: "Project logo",
    text: "Token logos should go through a controlled metadata path so a random launch cannot impersonate another asset."
  },
  {
    title: "Launch analytics",
    text: "A later version can show holders, LP depth, trade count, and recent buys directly in the creator dashboard."
  }
]

const ownerLaunches: OwnerLaunchRecord[] = []

const loadStoredDraft = () => {
  if (typeof window === "undefined") return initialDraft
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return initialDraft
    const parsed = JSON.parse(raw) as Partial<DraftLaunch>
    return { ...initialDraft, ...parsed }
  } catch {
    return initialDraft
  }
}

const loadCreatedLaunches = (): OwnerLaunchRecord[] => {
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

const saveCreatedLaunches = (records: OwnerLaunchRecord[]) => {
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

const launchPublicRecordItems = [
  "Token contract",
  "Pair contract",
  "Creator address",
  "Initial liquidity",
  "LP lock expiry",
  "Risk labels"
]

const cw20PublicRecordItems = [
  "Token contract",
  "Creator address",
  "Total supply",
  "Decimals",
  "Project info",
  "No pool warning"
]

const toNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, "").trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const formatNumber = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits
  }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value)

const formatPrice = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  if (value < 0.000001) return value.toExponential(3)
  if (value < 1) return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
  return formatNumber(value, 6)
}

const formatDateTime = (value: string | number | Date) =>
  new Date(value).toLocaleString()

const buildOwnerRecordFromRegistryLaunch = (
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

const mergeRecoveredOwnerRecord = (
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
    registryStatusTxHash: existing.registryStatusTxHash
  }
}

const Launchpad = () => {
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const [activeTab, setActiveTab] = useState<LaunchTab>("create")
  const [activeCreateStep, setActiveCreateStep] =
    useState<CreateStep>("token")
  const [activeLaunchFilter, setActiveLaunchFilter] =
    useState<LaunchFilter>("all")
  const [launchSearch, setLaunchSearch] = useState("")
  const [selectedLaunchId, setSelectedLaunchId] = useState("")
  const [activeOwnerId, setActiveOwnerId] = useState("")
  const [draft, setDraft] = useState<DraftLaunch>(() => loadStoredDraft())
  const [createdLaunches, setCreatedLaunches] = useState<OwnerLaunchRecord[]>(
    () => loadCreatedLaunches()
  )
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const [createdToken, setCreatedToken] = useState<{
    hash: string
    contractAddress: string
  }>()
  const [importAddress, setImportAddress] = useState("")
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [importError, setImportError] = useState<string>()
  const [syncSubmitting, setSyncSubmitting] = useState(false)
  const [syncError, setSyncError] = useState<string>()
  const [syncResult, setSyncResult] = useState("")
  const [pairLookup, setPairLookup] = useState<Record<string, PairLookupState>>(
    {}
  )
  const [lpTokenLookup, setLpTokenLookup] = useState<
    Record<string, TokenInfoLookupState>
  >({})
  const [lpBalanceLookup, setLpBalanceLookup] = useState<
    Record<string, TokenBalanceLookupState>
  >({})
  const [lpBalanceRefreshNonce, setLpBalanceRefreshNonce] = useState(0)
  const [createPairSubmitting, setCreatePairSubmitting] = useState(false)
  const [createPairError, setCreatePairError] = useState<string>()
  const [createPairTxHash, setCreatePairTxHash] = useState("")
  const [liquidityTokenAmount, setLiquidityTokenAmount] = useState("")
  const [liquidityLuncAmount, setLiquidityLuncAmount] = useState("")
  const [liquiditySlippage, setLiquiditySlippage] = useState("1")
  const [provideLiquiditySubmitting, setProvideLiquiditySubmitting] =
    useState(false)
  const [provideLiquidityError, setProvideLiquidityError] = useState<string>()
  const [provideLiquidityTxHash, setProvideLiquidityTxHash] = useState("")
  const [withdrawLiquidityAmount, setWithdrawLiquidityAmount] = useState("")
  const [withdrawLiquiditySubmitting, setWithdrawLiquiditySubmitting] =
    useState(false)
  const [withdrawLiquidityError, setWithdrawLiquidityError] =
    useState<string>()
  const [withdrawLiquidityTxHash, setWithdrawLiquidityTxHash] = useState("")
  const [lockLpAmount, setLockLpAmount] = useState("")
  const [lockLpDays, setLockLpDays] = useState("90")
  const [lockLpSubmitting, setLockLpSubmitting] = useState(false)
  const [lockLpError, setLockLpError] = useState<string>()
  const [lockLpTxHash, setLockLpTxHash] = useState("")
  const [withdrawLpSubmitting, setWithdrawLpSubmitting] = useState(false)
  const [withdrawLpError, setWithdrawLpError] = useState<string>()
  const [withdrawLpTxHash, setWithdrawLpTxHash] = useState("")
  const [registryLaunches, setRegistryLaunches] = useState<
    LaunchRegistryLaunch[]
  >([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string>()
  const [publishWebsite, setPublishWebsite] = useState("")
  const [publishXProfile, setPublishXProfile] = useState("")
  const [publishDescription, setPublishDescription] = useState("")
  const [publishSubmitting, setPublishSubmitting] = useState(false)
  const [publishError, setPublishError] = useState<string>()
  const [publishTxHash, setPublishTxHash] = useState("")
  const [listingStatusSubmitting, setListingStatusSubmitting] = useState<
    "live" | "hidden" | null
  >(null)
  const [listingStatusError, setListingStatusError] = useState<string>()
  const [listingStatusTxHash, setListingStatusTxHash] = useState("")
  const [copiedValue, setCopiedValue] = useState("")
  const [copyError, setCopyError] = useState("")
  const [localRecordNotice, setLocalRecordNotice] = useState("")

  const updateDraft =
    (field: keyof DraftLaunch) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((current) => ({ ...current, [field]: event.target.value }))
    }

  const handleCopyText = async (value: string) => {
    if (!value) return
    try {
      setCopyError("")
      await navigator.clipboard.writeText(value)
      setCopiedValue(value)
      window.setTimeout(() => {
        setCopiedValue((current) => (current === value ? "" : current))
      }, 1600)
    } catch {
      setCopyError("Copy failed. Select the address manually.")
    }
  }

  const launchMath = useMemo(() => {
    const supply = Math.max(0, toNumber(draft.supply))
    const poolPercent = Math.min(
      100,
      Math.max(0, toNumber(draft.tokenForPoolPercent))
    )
    const luncLiquidity = Math.max(0, toNumber(draft.luncLiquidity))
    const tokenForPool = supply * (poolPercent / 100)
    const startPriceLunc = tokenForPool > 0 ? luncLiquidity / tokenForPool : 0
    const startingMcapLunc = supply * startPriceLunc
    const creatorReserve = Math.max(0, supply - tokenForPool)

    return {
      supply,
      poolPercent,
      luncLiquidity,
      tokenForPool,
      creatorReserve,
      startPriceLunc,
      startingMcapLunc
    }
  }, [draft])

  const tokenSymbol = draft.symbol.trim().toUpperCase() || "TOKEN"
  const isCw20Only = draft.mode === "cw20"
  const lockDays = toNumber(draft.lockDays)
  const decimals = toNumber(draft.decimals)

  const readiness = useMemo(() => {
    const symbol = draft.symbol.trim().toUpperCase()
    const baseItems = [
      {
        label: "Token name",
        done: draft.name.trim().length >= 3
      },
      {
        label: "Symbol",
        done: /^[A-Z0-9]{2,12}$/.test(symbol)
      },
      {
        label: "Supply",
        done: launchMath.supply > 0
      },
      {
        label: "Decimals",
        done: Number.isInteger(decimals) && decimals >= 0 && decimals <= 18
      },
      {
        label: "Public info",
        done: Boolean(draft.website.trim() || draft.description.trim())
      }
    ]
    const launchItems = isCw20Only
      ? [
          {
            label: "CW20 only mode",
            done: true
          }
        ]
      : [
      {
        label: "Pool liquidity",
        done: launchMath.luncLiquidity > 0 && launchMath.poolPercent >= 10
      },
      {
        label: "LP lock",
        done: lockDays >= 30
      }
        ]
    const items = [...baseItems, ...launchItems]
    const completed = items.filter((item) => item.done).length
    return {
      items,
      completed,
      percent: Math.round((completed / items.length) * 100)
    }
  }, [
    decimals,
    draft.description,
    draft.name,
    draft.symbol,
    draft.website,
    isCw20Only,
    launchMath.luncLiquidity,
    launchMath.poolPercent,
    launchMath.supply,
    lockDays
  ])

  const canPreviewBuild = readiness.percent === 100
  const normalizedDraftSymbol = draft.symbol.trim().toUpperCase()
  const symbolIsValid = /^[A-Z0-9]{2,12}$/.test(normalizedDraftSymbol)
  const tokenStepDone =
    draft.name.trim().length >= 3 &&
    symbolIsValid &&
    launchMath.supply > 0 &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 18
  const liquidityStepDone =
    isCw20Only ||
    launchMath.luncLiquidity > 0 &&
    launchMath.poolPercent >= 10 &&
    launchMath.poolPercent <= 100 &&
    launchMath.tokenForPool > 0
  const safetyStepDone =
    (isCw20Only || lockDays >= 30) &&
    Boolean(draft.website.trim() || draft.description.trim())
  const createStepStatus = {
    token: {
      done: tokenStepDone,
      hint: "Add a valid name, 2-12 character symbol, supply, and 0-18 decimals."
    },
    liquidity: {
      done: liquidityStepDone,
      hint: isCw20Only
        ? "CW20 only mode skips liquidity. Switch to Launch with pool if this token should trade immediately."
        : "Set LUNC liquidity and seed at least 10% of supply into the pool."
    },
    safety: {
      done: safetyStepDone,
      hint: isCw20Only
        ? "Add enough public info so users understand what this standalone token is for."
        : "Use at least a 30 day LP lock and add public project information."
    },
    summary: {
      done: readiness.percent === 100,
      hint: "Complete every previous section before building transactions."
    }
  } satisfies Record<CreateStep, { done: boolean; hint: string }>
  const activeCreateStepIndex = createSteps.findIndex(
    (step) => step.id === activeCreateStep
  )
  const activeStepStatus = createStepStatus[activeCreateStep]
  const activeStepIsFirst = activeCreateStepIndex <= 0
  const activeStepIsLast = activeCreateStepIndex >= createSteps.length - 1

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // Local draft persistence is a convenience layer, not a blocker.
    }
  }, [draft])

  useEffect(() => {
    saveCreatedLaunches(createdLaunches)
  }, [createdLaunches])

  useEffect(() => {
    if (!isLaunchRegistryConfigured) return
    let cancelled = false
    setRegistryLoading(true)
    setRegistryError(undefined)
    fetchLaunchRegistryLaunches()
      .then((launches) => {
        if (cancelled) return
        setRegistryLaunches(launches)
      })
      .catch((error) => {
        if (cancelled) return
        setRegistryError(
          error instanceof Error ? error.message : "Launch registry query failed."
        )
      })
      .finally(() => {
        if (!cancelled) setRegistryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const goToPreviousCreateStep = () => {
    const previous = createSteps[activeCreateStepIndex - 1]?.id
    if (previous) setActiveCreateStep(previous)
  }

  const goToNextCreateStep = () => {
    const next = createSteps[activeCreateStepIndex + 1]?.id
    if (next) setActiveCreateStep(next)
  }

  const resetDraft = () => {
    setDraft(initialDraft)
    setActiveCreateStep("token")
    setRiskAcknowledged(false)
    setCreateError(undefined)
    setCreatedToken(undefined)
  }

  const handleCreateTokenContract = async () => {
    if (!riskAcknowledged || !canPreviewBuild) {
      setCreateError("Complete the draft and confirm the risk notice first.")
      return
    }
    if (!connectorId || !account?.address) {
      setCreateError("Connect a wallet first.")
      return
    }

    try {
      setCreateSubmitting(true)
      setCreateError(undefined)
      setCreatedToken(undefined)
      startTx(`Create ${tokenSymbol}`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const message = buildCw20InstantiateMessage(
        {
          creatorAddress: signerAddress,
          name: draft.name,
          symbol: tokenSymbol,
          supply: draft.supply,
          decimals
        },
        `Burrito ${tokenSymbol}`
      )
      const result = await client.signAndBroadcast(
        signerAddress,
        [message],
        "auto",
        isCw20Only ? "Burrito CW20 only" : "Burrito launch token"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Create token failed")
      }
      const contractAddress = extractContractAddressFromEvents(result.events)
      const recordId = contractAddress || result.transactionHash
      const isLaunchWithPool = !isCw20Only
      const createdRecord: OwnerLaunchRecord = {
        id: recordId,
        symbol: tokenSymbol,
        name: draft.name.trim(),
        pair: isLaunchWithPool
          ? `${tokenSymbol} / LUNC`
          : `${tokenSymbol} standalone`,
        liquidity: isLaunchWithPool
          ? `${formatCompact(launchMath.luncLiquidity)} LUNC planned`
          : "--",
        lockExpiry: isLaunchWithPool
          ? `${formatNumber(lockDays, 0)} days planned`
          : "No LP",
        infoStatus: draft.website.trim()
          ? "Public info complete"
          : "Missing website",
        ownerStatus: isLaunchWithPool
          ? "Token created, pool setup needed"
          : "CW20 contract created",
        mode: isLaunchWithPool ? "Launch with pool" : "CW20 only",
        contractAddress,
        txHash: result.transactionHash,
        decimals,
        totalSupply: draft.supply,
        website: draft.website.trim(),
        xProfile: draft.xProfile.trim(),
        description: draft.description.trim(),
        createdAt: new Date().toISOString(),
        plannedTokenAmount: isLaunchWithPool
          ? String(launchMath.tokenForPool)
          : undefined,
        plannedLuncAmount: isLaunchWithPool
          ? String(launchMath.luncLiquidity)
          : undefined,
        plannedLockDays: isLaunchWithPool ? String(lockDays) : undefined
      }
      setCreatedToken({
        hash: result.transactionHash,
        contractAddress
      })
      setCreatedLaunches((current) => [
        createdRecord,
        ...current.filter((record) => record.id !== recordId)
      ])
      setActiveOwnerId(recordId)
      setActiveTab("manage")
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Create token failed"
      setCreateError(message)
      failTx(message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleImportCw20 = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const address = importAddress.trim()
    if (!/^terra1[0-9a-z]{38,80}$/.test(address)) {
      setImportError("Enter a valid Terra Classic contract address.")
      return
    }

    try {
      setImportSubmitting(true)
      setImportError(undefined)
      const [contractInfo, tokenInfo] = await Promise.all([
        fetchContractInfo(address),
        queryContractSmart<Cw20TokenInfo>(address, { token_info: {} })
      ])
      if (!contractInfo) {
        throw new Error("Contract was not found on Terra Classic.")
      }
      if (!tokenInfo?.symbol || !tokenInfo?.name) {
        throw new Error("This contract does not look like a CW20 token.")
      }

      const [registryLaunch, pair] = await Promise.all([
        fetchLaunchRegistryLaunch(address).catch(() => null),
        fetchTerraswapLuncPair(address).catch(() => null)
      ])
      const symbol = (
        registryLaunch?.metadata?.symbol ||
        tokenInfo.symbol
      ).toUpperCase()
      const name = registryLaunch?.metadata?.name || tokenInfo.name
      const importedRecord: OwnerLaunchRecord = registryLaunch
        ? buildOwnerRecordFromRegistryLaunch(registryLaunch, tokenInfo)
        : {
            id: address,
            symbol,
            name,
            pair: pair ? `${symbol} / LUNC` : `${symbol} standalone`,
            liquidity: pair ? "Pair exists" : "--",
            lockExpiry: pair ? "LP not locked" : "No LP",
            infoStatus: "Imported contract",
            ownerStatus: pair ? "Pair found" : "CW20 contract imported",
            mode: pair ? "CW20 + Pair" : "CW20 only",
            contractAddress: address,
            decimals: tokenInfo.decimals,
            totalSupply: tokenInfo.total_supply,
            pairAddress: pair?.contract_addr,
            liquidityToken: pair?.liquidity_token,
            createdAt: new Date().toISOString()
          }
      setPairLookup((current) => ({
        ...current,
        [address]: {
          status: pair ? "found" : "missing",
          pair
        }
      }))
      setCreatedLaunches((current) => [
        importedRecord,
        ...current.filter(
          (record) => record.id !== address && record.contractAddress !== address
        )
      ])
      setActiveOwnerId(address)
      setImportAddress("")
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import token failed."
      )
    } finally {
      setImportSubmitting(false)
    }
  }

  const handleSyncOwnerLaunches = async () => {
    if (!account?.address) {
      setSyncError("Connect a wallet first.")
      setSyncResult("")
      return
    }
    if (!isLaunchRegistryConfigured) {
      setSyncError("Launch registry contract is not configured.")
      setSyncResult("")
      return
    }

    try {
      setSyncSubmitting(true)
      setSyncError(undefined)
      setSyncResult("")
      const launches = await fetchLaunchRegistryLaunches()
      setRegistryLaunches(launches)
      const ownerAddress = account.address.toLowerCase()
      const ownedLaunches = launches.filter(
        (launch) => launch.creator.toLowerCase() === ownerAddress
      )
      if (!ownedLaunches.length) {
        setSyncResult("No published launches found for this wallet.")
        return
      }

      const recoveredRecords = await Promise.all(
        ownedLaunches.map(async (launch) => {
          const tokenInfo = await queryContractSmart<Cw20TokenInfo>(
            launch.token_contract,
            { token_info: {} }
          ).catch(() => null)
          return buildOwnerRecordFromRegistryLaunch(launch, tokenInfo)
        })
      )
      setPairLookup((current) => {
        const next = { ...current }
        for (const launch of ownedLaunches) {
          next[launch.token_contract] = {
            status: "found",
            pair: {
              asset_infos: [],
              contract_addr: launch.pair_contract,
              liquidity_token: launch.lp_token
            }
          }
        }
        return next
      })
      setCreatedLaunches((current) => {
        const recoveredKeys = new Set(
          recoveredRecords.map((record) => record.contractAddress ?? record.id)
        )
        const mergedRecords = recoveredRecords.map((record) =>
          mergeRecoveredOwnerRecord(
            current.find(
              (item) =>
                item.id === record.id ||
                item.contractAddress === record.contractAddress
            ),
            record
          )
        )
        const untouchedRecords = current.filter(
          (record) =>
            !recoveredKeys.has(record.id) &&
            !recoveredKeys.has(record.contractAddress ?? "")
        )
        return [...mergedRecords, ...untouchedRecords]
      })
      setActiveOwnerId(recoveredRecords[0]?.id ?? "")
      setSyncResult(
        `${recoveredRecords.length} launch${
          recoveredRecords.length === 1 ? "" : "es"
        } synced from registry.`
      )
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Sync launches failed."
      )
    } finally {
      setSyncSubmitting(false)
    }
  }

  const launchWarnings = useMemo(() => {
    const warnings: string[] = []
    if (isCw20Only) {
      warnings.push("CW20 only mode will not create a tradable market.")
      warnings.push("Users cannot swap this token until someone creates and funds a pool.")
      if (!draft.website.trim()) {
        warnings.push("Project website is missing.")
      }
      return warnings
    }
    if (launchMath.poolPercent < 50) {
      warnings.push("Less than 50% of supply is seeded into LP.")
    }
    if (lockDays < 90) {
      warnings.push("LP lock is short. 90 days or more is easier for users to trust.")
    }
    if (launchMath.luncLiquidity > 0 && launchMath.luncLiquidity < 1_000_000) {
      warnings.push("Initial LUNC liquidity is low, so price impact may be high.")
    }
    if (!draft.website.trim()) {
      warnings.push("Project website is missing.")
    }
    return warnings
  }, [
    draft.website,
    isCw20Only,
    launchMath.luncLiquidity,
    launchMath.poolPercent,
    lockDays
  ])
  const transactionPlan = useMemo(
    () => [
      {
        title: "Instantiate CW20",
        text: `Create ${tokenSymbol} with fixed supply and public metadata.`
      },
      ...(isCw20Only
        ? [
            {
              title: "Skip pool creation",
              text: "No Token / LUNC pair is created in CW20 only mode."
            },
            {
              title: "Show contract record",
              text: "The token can be managed from creator tools, but it is not a launch market."
            }
          ]
        : [
            {
              title: "Create Token / LUNC pair",
              text: `Open a Terraswap pool for ${tokenSymbol} / LUNC.`
            },
            {
              title: "Provide initial liquidity",
              text: `Deposit ${formatCompact(launchMath.tokenForPool)} ${tokenSymbol} and ${formatCompact(
                launchMath.luncLiquidity
              )} LUNC.`
            },
            {
              title: "Lock LP",
              text: `Lock initial LP for ${formatNumber(lockDays, 0)} days before listing.`
            },
            {
              title: "Create Burrito listing",
              text: "Register public facts, risk labels, and owner controls."
            }
          ])
    ],
    [
      isCw20Only,
      launchMath.luncLiquidity,
      launchMath.tokenForPool,
      lockDays,
      tokenSymbol
    ]
  )
  const registeredLaunchCards = useMemo(
    () =>
      [...registryLaunches]
        .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
        .filter((launch) => launch.status !== "hidden")
        .map<LaunchCardItem>((launch) => {
          const nowSeconds = Math.floor(Date.now() / 1000)
          const unlockDays = Math.max(
            0,
            Math.ceil((launch.lp_unlock_time - nowSeconds) / 86400)
          )
          const hasPublicInfo = Boolean(
            launch.metadata.website || launch.metadata.description
          )
          const state: Exclude<LaunchFilter, "all"> =
            unlockDays <= 0 ? "ended" : hasPublicInfo ? "live" : "risk"
          const status =
            state === "ended"
              ? "LP unlocked"
              : state === "risk"
              ? "Needs public info"
              : "Published launch"
          return {
            id: `registry-${launch.id}`,
            symbol: launch.metadata.symbol,
            name: launch.metadata.name,
            pair: `${launch.metadata.symbol} / LUNC`,
            state,
            status,
            liquidity: "On-chain LP",
            lock: unlockDays > 0 ? `${unlockDays} days` : "Unlocked",
            creator: truncateHash(launch.creator),
            risk: hasPublicInfo
              ? `LP lock #${launch.lp_lock_id}`
              : "Public info incomplete",
            progress: 100,
            tokenContract: launch.token_contract,
            pairContract: launch.pair_contract,
            registryLaunchId: launch.id,
            lpLockId: launch.lp_lock_id,
            website: launch.metadata.website,
            xProfile: launch.metadata.x_profile,
            description: launch.metadata.description,
            createdAt: launch.created_at,
            unlockTime: launch.lp_unlock_time
          }
        }),
    [registryLaunches]
  )
  const shouldShowSampleLaunches =
    import.meta.env.DEV &&
    !isLaunchRegistryConfigured &&
    registeredLaunchCards.length === 0
  const launchSource = registeredLaunchCards.length
    ? registeredLaunchCards
    : shouldShowSampleLaunches
    ? sampleLaunches
    : []
  const launchStats = launchSource.reduce(
    (stats, launch) => ({
      total: stats.total + 1,
      live: stats.live + (launch.state === "live" ? 1 : 0),
      ended: stats.ended + (launch.state === "ended" ? 1 : 0),
      risk: stats.risk + (launch.state === "risk" ? 1 : 0)
    }),
    { total: 0, live: 0, ended: 0, risk: 0 }
  )
  const normalizedLaunchSearch = launchSearch.trim().toLowerCase()
  const filteredLaunches = launchSource.filter((launch) => {
    if (activeLaunchFilter !== "all" && launch.state !== activeLaunchFilter) {
      return false
    }
    if (!normalizedLaunchSearch) return true
    return [
      launch.symbol,
      launch.name,
      launch.pair,
      launch.creator,
      launch.tokenContract,
      launch.pairContract,
      launch.registryLaunchId ? String(launch.registryLaunchId) : ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedLaunchSearch)
  })
  const selectedLaunch =
    filteredLaunches.find((launch) => launch.id === selectedLaunchId) ??
    filteredLaunches[0]
  const exploreEmptyText = registryLoading
    ? "Loading on-chain Burrito launches..."
    : registryError
    ? `Registry error: ${registryError}`
    : normalizedLaunchSearch
    ? "No launches match your search."
    : isLaunchRegistryConfigured
    ? "No on-chain Burrito launches have been published yet."
    : "Registry contract is not configured yet. No public launches are live."
  const ownerRecords = useMemo(
    () => [...createdLaunches, ...ownerLaunches],
    [createdLaunches]
  )
  const activeOwnerLaunch =
    ownerRecords.find((launch) => launch.id === activeOwnerId) ??
    ownerRecords[0]

  useEffect(() => {
    if (!ownerRecords.length) {
      if (activeOwnerId) setActiveOwnerId("")
      return
    }
    if (!ownerRecords.some((launch) => launch.id === activeOwnerId)) {
      setActiveOwnerId(ownerRecords[0].id)
    }
  }, [activeOwnerId, ownerRecords])

  const activeOwnerRecordId = activeOwnerLaunch?.id ?? ""
  const activeOwnerWebsite = activeOwnerLaunch?.website ?? ""
  const activeOwnerXProfile = activeOwnerLaunch?.xProfile ?? ""
  const activeOwnerDescription = activeOwnerLaunch?.description ?? ""
  const isActiveOwnerLocalRecord = Boolean(
    activeOwnerLaunch &&
      createdLaunches.some((record) => record.id === activeOwnerLaunch.id)
  )
  const activeOwnerPlannedTokenAmount =
    activeOwnerLaunch?.plannedTokenAmount ?? ""
  const activeOwnerPlannedLuncAmount = activeOwnerLaunch?.plannedLuncAmount ?? ""
  const activeOwnerPlannedLockDays = activeOwnerLaunch?.plannedLockDays ?? "90"
  const activeTokenAddress = activeOwnerLaunch?.contractAddress
  const activePairLookup = activeTokenAddress
    ? pairLookup[activeTokenAddress] ?? { status: "idle" as const }
    : { status: "idle" as const }
  const activePair = activePairLookup.pair ?? null
  const activePairAddress =
    activePair?.contract_addr ?? activeOwnerLaunch?.pairAddress ?? ""
  const activeLiquidityToken =
    activePair?.liquidity_token ?? activeOwnerLaunch?.liquidityToken ?? ""
  const activeLpTokenLookup = activeLiquidityToken
    ? lpTokenLookup[activeLiquidityToken] ?? { status: "idle" as const }
    : { status: "idle" as const }
  const activeLpDecimals =
    typeof activeLpTokenLookup.info?.decimals === "number"
      ? activeLpTokenLookup.info.decimals
      : 6
  const activeLpBalanceKey =
    activeLiquidityToken && account?.address
      ? `${activeLiquidityToken}:${account.address}`
      : ""
  const activeLpBalanceLookup = activeLpBalanceKey
    ? lpBalanceLookup[activeLpBalanceKey] ?? { status: "idle" as const }
    : { status: "idle" as const }
  const activeLpBalanceDisplay = formatBaseUnitsToTokenAmount(
    activeLpBalanceLookup.balance,
    activeLpDecimals
  )
  const activeLpBalanceInputAmount =
    activeLpBalanceLookup.balance && activeLpBalanceLookup.balance !== "0"
      ? formatBaseUnitsToTokenAmount(
          activeLpBalanceLookup.balance,
          activeLpDecimals,
          activeLpDecimals
        ).replace(/,/g, "")
      : ""
  const hasActiveLpBalance = Boolean(activeLpBalanceInputAmount)
  const activeTokenDecimals =
    typeof activeOwnerLaunch?.decimals === "number"
      ? activeOwnerLaunch.decimals
      : 6
  const canCreatePair =
    Boolean(activeTokenAddress) &&
    !activePairAddress &&
    activePairLookup.status !== "loading"
  const hasLiquidityInput = Boolean(
    liquidityTokenAmount.trim() && liquidityLuncAmount.trim()
  )
  const canProvideLiquidity = Boolean(
    activeTokenAddress &&
      activePairAddress &&
      connectorId &&
      account?.address &&
      hasLiquidityInput &&
      !provideLiquiditySubmitting
  )
  const hasWithdrawLiquidityInput = Boolean(withdrawLiquidityAmount.trim())
  const canWithdrawLiquidity = Boolean(
    activePairAddress &&
      activeLiquidityToken &&
      connectorId &&
      account?.address &&
      hasWithdrawLiquidityInput &&
      !withdrawLiquiditySubmitting
  )
  const hasLockInput = Boolean(lockLpAmount.trim() && lockLpDays.trim())
  const canLockLp = Boolean(
    activeLiquidityToken &&
      activePairAddress &&
      isLpLockerConfigured &&
      connectorId &&
      account?.address &&
      hasLockInput &&
      !lockLpSubmitting
  )
  const lockUnlockPreview = useMemo(() => {
    try {
      if (!lockLpDays.trim()) return "--"
      return formatDateTime(getLpUnlockTimestampSeconds(lockLpDays) * 1000)
    } catch {
      return "--"
    }
  }, [lockLpDays])
  const activeLpUnlockTime = activeOwnerLaunch?.lpUnlockAt
    ? new Date(activeOwnerLaunch.lpUnlockAt).getTime()
    : 0
  const activeLpLockHasExpired =
    Boolean(activeLpUnlockTime) && activeLpUnlockTime <= Date.now()
  const canWithdrawLockedLp = Boolean(
    activeOwnerLaunch?.lpLockId &&
      activeLpLockHasExpired &&
      isLpLockerConfigured &&
      connectorId &&
      account?.address &&
      !withdrawLpSubmitting
  )
  const hasPublicListingPrerequisites = Boolean(
    activeOwnerLaunch?.contractAddress &&
      activePairAddress &&
      activeLiquidityToken &&
      activeOwnerLaunch?.lpLockId &&
      activeOwnerLaunch?.lpUnlockAt
  )
  const isActiveListingPublished = Boolean(
    activeOwnerLaunch?.registryTxHash || activeOwnerLaunch?.registryLaunchId
  )
  const activeRegistryStatus = activeOwnerLaunch?.registryStatus ?? "live"

  const handleRemoveLocalRecord = () => {
    if (!activeOwnerLaunch || !isActiveOwnerLocalRecord) return
    const confirmed = window.confirm(
      `Remove ${activeOwnerLaunch.pair} from this browser only? This does not touch the token, pool, LP lock, or registry on-chain.`
    )
    if (!confirmed) return

    setCreatedLaunches((current) =>
      current.filter((record) => record.id !== activeOwnerLaunch.id)
    )
    setLocalRecordNotice(
      `${activeOwnerLaunch.pair} was removed from local browser storage. On-chain data is unchanged and can be recovered with Import or Sync.`
    )
  }
  const canPublishListing = Boolean(
    (hasPublicListingPrerequisites || isActiveListingPublished) &&
      isLaunchRegistryConfigured &&
      (isActiveListingPublished || isLpLockerConfigured) &&
      connectorId &&
      account?.address &&
      !publishSubmitting
  )
  const publicRecordItems = isCw20Only
    ? cw20PublicRecordItems
    : launchPublicRecordItems
  const transactionPackageItems = isCw20Only
    ? [
        { label: "Transactions", value: "1" },
        { label: "Needs LUNC", value: "Gas only" },
        { label: "Pool", value: "Skipped" },
        { label: "Market / Swap", value: "No route" }
      ]
    : [
        { label: "Transactions", value: "4-5" },
        { label: "Needs LUNC", value: "Gas + LP" },
        { label: "Pool", value: `${tokenSymbol} / LUNC` },
        { label: "Market / Swap", value: "Launch route" }
      ]
  const riskConfirmationText = isCw20Only
    ? "I understand CW20 only mode creates a token contract without price, pool, Market listing, or Swap route."
    : "I understand the launch price comes from initial liquidity, and LP lock details will be public."

  useEffect(() => {
    if (!activeTokenAddress) return
    let cancelled = false
    setPairLookup((current) => ({
      ...current,
      [activeTokenAddress]: {
        ...(current[activeTokenAddress] ?? { status: "idle" }),
        status: "loading"
      }
    }))

    fetchTerraswapLuncPair(activeTokenAddress)
      .then((pair) => {
        if (cancelled) return
        setPairLookup((current) => ({
          ...current,
          [activeTokenAddress]: {
            status: pair ? "found" : "missing",
            pair
          }
        }))
      })
      .catch((error) => {
        if (cancelled) return
        setPairLookup((current) => ({
          ...current,
          [activeTokenAddress]: {
            status: "error",
            error:
              error instanceof Error ? error.message : "Pair lookup failed."
          }
        }))
      })

    return () => {
      cancelled = true
    }
  }, [activeTokenAddress])

  useEffect(() => {
    if (!activeLiquidityToken) return
    let cancelled = false
    setLpTokenLookup((current) => ({
      ...current,
      [activeLiquidityToken]: {
        ...(current[activeLiquidityToken] ?? { status: "idle" }),
        status: "loading"
      }
    }))

    queryContractSmart<Cw20TokenInfo>(activeLiquidityToken, { token_info: {} })
      .then((info) => {
        if (cancelled) return
        setLpTokenLookup((current) => ({
          ...current,
          [activeLiquidityToken]: {
            status: "found",
            info
          }
        }))
      })
      .catch((error) => {
        if (cancelled) return
        setLpTokenLookup((current) => ({
          ...current,
          [activeLiquidityToken]: {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "LP token lookup failed."
          }
        }))
      })

    return () => {
      cancelled = true
    }
  }, [activeLiquidityToken])

  useEffect(() => {
    if (!activeLiquidityToken || !account?.address || !activeLpBalanceKey) {
      return
    }
    let cancelled = false
    setLpBalanceLookup((current) => ({
      ...current,
      [activeLpBalanceKey]: {
        ...(current[activeLpBalanceKey] ?? { status: "idle" }),
        status: "loading"
      }
    }))

    queryContractSmart<Cw20BalanceResponse>(activeLiquidityToken, {
      balance: {
        address: account.address
      }
    })
      .then((response) => {
        if (cancelled) return
        setLpBalanceLookup((current) => ({
          ...current,
          [activeLpBalanceKey]: {
            status: "found",
            balance: response.balance ?? "0"
          }
        }))
      })
      .catch((error) => {
        if (cancelled) return
        setLpBalanceLookup((current) => ({
          ...current,
          [activeLpBalanceKey]: {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "LP balance lookup failed."
          }
        }))
      })

    return () => {
      cancelled = true
    }
  }, [
    account?.address,
    activeLiquidityToken,
    activeLpBalanceKey,
    lpBalanceRefreshNonce
  ])

  useEffect(() => {
    setProvideLiquidityError(undefined)
    setProvideLiquidityTxHash("")
    setWithdrawLiquidityError(undefined)
    setWithdrawLiquidityTxHash("")
    setWithdrawLiquidityAmount("")
    setLockLpError(undefined)
    setLockLpTxHash("")
    setWithdrawLpError(undefined)
    setWithdrawLpTxHash("")
    setPublishError(undefined)
    setPublishTxHash("")
    setListingStatusError(undefined)
    setListingStatusTxHash("")
    setListingStatusSubmitting(null)
    setLocalRecordNotice("")
  }, [activeOwnerId])

  useEffect(() => {
    setPublishWebsite(activeOwnerWebsite)
    setPublishXProfile(activeOwnerXProfile)
    setPublishDescription(activeOwnerDescription)
  }, [
    activeOwnerRecordId,
    activeOwnerWebsite,
    activeOwnerXProfile,
    activeOwnerDescription
  ])

  useEffect(() => {
    setLiquidityTokenAmount(activeOwnerPlannedTokenAmount)
    setLiquidityLuncAmount(activeOwnerPlannedLuncAmount)
    setLockLpDays(activeOwnerPlannedLockDays)
  }, [
    activeOwnerRecordId,
    activeOwnerPlannedTokenAmount,
    activeOwnerPlannedLuncAmount,
    activeOwnerPlannedLockDays
  ])

  const handleCreateTerraswapPair = async () => {
    if (!activeOwnerLaunch || !activeTokenAddress) {
      setCreatePairError("Import or create a CW20 token first.")
      return
    }
    if (activePairAddress) {
      setCreatePairError("This token already has a Terraswap LUNC pair.")
      return
    }
    if (!connectorId || !account?.address) {
      setCreatePairError("Connect a wallet first.")
      return
    }

    try {
      setCreatePairSubmitting(true)
      setCreatePairError(undefined)
      setCreatePairTxHash("")
      startTx(`Create ${activeOwnerLaunch.symbol} / LUNC pair`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const message = buildCreateTerraswapLuncPairMessage(
        signerAddress,
        activeTokenAddress
      )
      const result = await client.signAndBroadcast(
        signerAddress,
        [message],
        "auto",
        "Burrito create LUNC pair"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Create pair failed")
      }

      const pair = await waitForTerraswapLuncPair(activeTokenAddress)
      setCreatePairTxHash(result.transactionHash)
      if (pair) {
        setPairLookup((current) => ({
          ...current,
          [activeTokenAddress]: {
            status: "found",
            pair
          }
        }))
        setCreatedLaunches((current) =>
          current.map((record) =>
            record.id === activeOwnerLaunch.id
              ? {
                  ...record,
                  pair: `${record.symbol} / LUNC`,
                  mode: "CW20 + Pair",
                  ownerStatus: "Pair created, liquidity not added",
                  pairAddress: pair.contract_addr,
                  liquidityToken: pair.liquidity_token,
                  pairTxHash: result.transactionHash
                }
              : record
          )
        )
      } else {
        setPairLookup((current) => ({
          ...current,
          [activeTokenAddress]: {
            status: "missing",
            error: "Pair transaction succeeded, but LCD has not indexed it yet."
          }
        }))
      }
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Create pair failed."
      setCreatePairError(message)
      failTx(message)
    } finally {
      setCreatePairSubmitting(false)
    }
  }

  const handleProvideLiquidity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOwnerLaunch || !activeTokenAddress) {
      setProvideLiquidityError("Import or create a CW20 token first.")
      return
    }
    if (!activePairAddress) {
      setProvideLiquidityError("Create or find the LUNC pair first.")
      return
    }
    if (!connectorId || !account?.address) {
      setProvideLiquidityError("Connect a wallet first.")
      return
    }

    try {
      setProvideLiquiditySubmitting(true)
      setProvideLiquidityError(undefined)
      setProvideLiquidityTxHash("")
      const tokenBaseAmount = parseTokenAmountToBaseUnits(
        liquidityTokenAmount,
        activeTokenDecimals,
        `${activeOwnerLaunch.symbol} amount`
      )
      const luncBaseAmount = parseLuncAmountToBaseUnits(liquidityLuncAmount)
      const slippageTolerance = formatSlippageTolerance(
        liquiditySlippage || "1"
      )

      startTx(`Provide ${activeOwnerLaunch.symbol} / LUNC liquidity`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          buildIncreaseAllowanceMessage({
            sender: signerAddress,
            tokenAddress: activeTokenAddress,
            spender: activePairAddress,
            amount: tokenBaseAmount
          }),
          buildProvideTerraswapLiquidityMessage({
            sender: signerAddress,
            pairAddress: activePairAddress,
            tokenAddress: activeTokenAddress,
            tokenAmount: tokenBaseAmount,
            luncAmount: luncBaseAmount,
            slippageTolerance
          })
        ],
        "auto",
        "Burrito provide liquidity"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Provide liquidity failed")
      }

      const liquidityLabel = `${formatCompact(
        toNumber(liquidityTokenAmount)
      )} ${activeOwnerLaunch.symbol} + ${formatCompact(
        toNumber(liquidityLuncAmount)
      )} LUNC`
      setProvideLiquidityTxHash(result.transactionHash)
      setLpBalanceRefreshNonce((current) => current + 1)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                pair: `${record.symbol} / LUNC`,
                liquidity: liquidityLabel,
                mode: "CW20 + Pair + LP",
                lockExpiry: "LP not locked",
                ownerStatus: "Liquidity added, LP not locked",
                liquidityTxHash: result.transactionHash
              }
            : record
        )
      )
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Provide liquidity failed."
      setProvideLiquidityError(message)
      failTx(message)
    } finally {
      setProvideLiquiditySubmitting(false)
    }
  }

  const handleWithdrawLiquidity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOwnerLaunch || !activePairAddress || !activeLiquidityToken) {
      setWithdrawLiquidityError("Create or find the pair and LP token first.")
      return
    }
    if (!connectorId || !account?.address) {
      setWithdrawLiquidityError("Connect a wallet first.")
      return
    }

    try {
      setWithdrawLiquiditySubmitting(true)
      setWithdrawLiquidityError(undefined)
      setWithdrawLiquidityTxHash("")
      const amount = parseLpAmountToBaseUnits(
        withdrawLiquidityAmount,
        activeLpDecimals
      )

      startTx(`Withdraw ${activeOwnerLaunch.symbol} / LUNC liquidity`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          buildWithdrawTerraswapLiquidityMessage({
            sender: signerAddress,
            pairAddress: activePairAddress,
            lpTokenAddress: activeLiquidityToken,
            lpAmount: amount
          })
        ],
        "auto",
        "Burrito withdraw liquidity"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Withdraw liquidity failed")
      }

      setWithdrawLiquidityTxHash(result.transactionHash)
      setLpBalanceRefreshNonce((current) => current + 1)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                ownerStatus: "Liquidity withdrawn",
                liquidityWithdrawTxHash: result.transactionHash
              }
            : record
        )
      )
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Withdraw liquidity failed."
      setWithdrawLiquidityError(message)
      failTx(message)
    } finally {
      setWithdrawLiquiditySubmitting(false)
    }
  }

  const handleLockLp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOwnerLaunch || !activePairAddress || !activeLiquidityToken) {
      setLockLpError("Create the pair and provide liquidity first.")
      return
    }
    if (!isLpLockerConfigured) {
      setLockLpError(
        "LP locker contract is not configured. Add VITE_LAUNCHPAD_LP_LOCKER_ADDRESS after deploying the locker."
      )
      return
    }
    if (!connectorId || !account?.address) {
      setLockLpError("Connect a wallet first.")
      return
    }

    try {
      setLockLpSubmitting(true)
      setLockLpError(undefined)
      setLockLpTxHash("")
      const amount = parseLpAmountToBaseUnits(lockLpAmount, activeLpDecimals)
      const unlockTimestamp = getLpUnlockTimestampSeconds(lockLpDays)

      startTx(`Lock ${activeOwnerLaunch.symbol} / LUNC LP`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          buildLockLpMessage({
            sender: signerAddress,
            lpTokenAddress: activeLiquidityToken,
            pairAddress: activePairAddress,
            amount,
            unlockTimestamp
          })
        ],
        "auto",
        "Burrito lock LP"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Lock LP failed")
      }

      const unlockDate = new Date(unlockTimestamp * 1000).toISOString()
      const lockId = extractLpLockIdFromEvents(result.events)
      setLockLpTxHash(result.transactionHash)
      setLpBalanceRefreshNonce((current) => current + 1)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                mode: "Launch ready",
                lockExpiry: formatDateTime(unlockDate),
                ownerStatus: "LP locked",
                lpLockId: lockId,
                lpLockTxHash: result.transactionHash,
                lpUnlockAt: unlockDate
              }
            : record
        )
      )
      finishTx(result.transactionHash)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lock LP failed."
      setLockLpError(message)
      failTx(message)
    } finally {
      setLockLpSubmitting(false)
    }
  }

  const handleWithdrawLockedLp = async () => {
    if (!activeOwnerLaunch?.lpLockId) {
      setWithdrawLpError("No LP lock id found for this launch.")
      return
    }
    if (!isLpLockerConfigured) {
      setWithdrawLpError("LP locker contract is not configured.")
      return
    }
    if (!activeLpLockHasExpired) {
      setWithdrawLpError("This LP lock has not reached its unlock time yet.")
      return
    }
    if (!connectorId || !account?.address) {
      setWithdrawLpError("Connect a wallet first.")
      return
    }

    try {
      setWithdrawLpSubmitting(true)
      setWithdrawLpError(undefined)
      setWithdrawLpTxHash("")
      startTx(`Withdraw ${activeOwnerLaunch.symbol} / LUNC LP`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          buildWithdrawLockedLpMessage({
            sender: signerAddress,
            lockId: Number(activeOwnerLaunch.lpLockId)
          })
        ],
        "auto",
        "Burrito withdraw locked LP"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Withdraw locked LP failed")
      }

      setWithdrawLpTxHash(result.transactionHash)
      setLpBalanceRefreshNonce((current) => current + 1)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                lockExpiry: "Withdrawn",
                ownerStatus: "LP withdrawn",
                lpWithdrawTxHash: result.transactionHash
              }
            : record
        )
      )
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Withdraw locked LP failed."
      setWithdrawLpError(message)
      failTx(message)
    } finally {
      setWithdrawLpSubmitting(false)
    }
  }

  const refreshRegistryLaunches = async () => {
    if (!isLaunchRegistryConfigured) return
    const launches = await fetchLaunchRegistryLaunches()
    setRegistryLaunches(launches)
  }

  const handlePublishListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOwnerLaunch?.contractAddress) {
      setPublishError("Create or import a CW20 token first.")
      return
    }
    const isUpdatingExistingListing = Boolean(
      activeOwnerLaunch.registryTxHash || activeOwnerLaunch.registryLaunchId
    )
    if (
      !isUpdatingExistingListing &&
      (!activePairAddress ||
        !activeLiquidityToken ||
        !activeOwnerLaunch.lpLockId ||
        !activeOwnerLaunch.lpUnlockAt)
    ) {
      setPublishError("Create token, pair, liquidity, and LP lock first.")
      return
    }
    if (!isLaunchRegistryConfigured) {
      setPublishError("Launch registry contract is not configured.")
      return
    }
    if (!isUpdatingExistingListing && !isLpLockerConfigured) {
      setPublishError("LP locker contract is not configured.")
      return
    }
    if (!connectorId || !account?.address) {
      setPublishError("Connect a wallet first.")
      return
    }

    try {
      setPublishSubmitting(true)
      setPublishError(undefined)
      setPublishTxHash("")
      const lpUnlockTime = activeOwnerLaunch.lpUnlockAt
        ? Math.floor(new Date(activeOwnerLaunch.lpUnlockAt).getTime() / 1000)
        : 0
      if (!isUpdatingExistingListing) {
        if (!Number.isFinite(lpUnlockTime) || lpUnlockTime <= 0) {
          throw new Error("Invalid LP unlock time.")
        }
      }

      startTx(
        isUpdatingExistingListing
          ? `Update ${activeOwnerLaunch.symbol} listing`
          : `Publish ${activeOwnerLaunch.symbol} launch`
      )
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          isUpdatingExistingListing
            ? buildUpdateLaunchMessage({
                sender: signerAddress,
                tokenContract: activeOwnerLaunch.contractAddress,
                metadata: {
                  name: activeOwnerLaunch.name,
                  symbol: activeOwnerLaunch.symbol,
                  website: publishWebsite,
                  xProfile: publishXProfile,
                  description: publishDescription
                }
              })
            : buildRegisterLaunchMessage({
                sender: signerAddress,
                tokenContract: activeOwnerLaunch.contractAddress,
                pairContract: activePairAddress,
                lpToken: activeLiquidityToken,
                lockerContract: LAUNCHPAD_LP_LOCKER_ADDRESS,
                lpLockId: activeOwnerLaunch.lpLockId ?? "",
                lpUnlockTime,
                metadata: {
                  name: activeOwnerLaunch.name,
                  symbol: activeOwnerLaunch.symbol,
                  website: publishWebsite,
                  xProfile: publishXProfile,
                  description: publishDescription
                }
              })
        ],
        "auto",
        isUpdatingExistingListing
          ? "Burrito update launch"
          : "Burrito publish launch"
      )
      if (result.code !== 0) {
        throw new Error(
          result.rawLog ||
            (isUpdatingExistingListing
              ? "Update listing failed"
              : "Publish listing failed")
        )
      }

      const launchId = isUpdatingExistingListing
        ? activeOwnerLaunch.registryLaunchId ?? ""
        : extractRegistryLaunchIdFromEvents(result.events)
      setPublishTxHash(result.transactionHash)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                mode: "Published launch",
                infoStatus: "Published",
                ownerStatus: isUpdatingExistingListing
                  ? "Listing metadata updated"
                  : "Launch published",
                website: publishWebsite.trim(),
                xProfile: publishXProfile.trim(),
                description: publishDescription.trim(),
                registryLaunchId: launchId,
                registryTxHash: isUpdatingExistingListing
                  ? record.registryTxHash
                  : result.transactionHash,
                registryUpdateTxHash: isUpdatingExistingListing
                  ? result.transactionHash
                  : record.registryUpdateTxHash,
                publishedAt:
                  record.publishedAt || new Date().toISOString()
              }
            : record
        )
      )
      await refreshRegistryLaunches()
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Publish listing failed."
      setPublishError(message)
      failTx(message)
    } finally {
      setPublishSubmitting(false)
    }
  }

  const handleSetListingStatus = async (status: "live" | "hidden") => {
    if (!activeOwnerLaunch?.contractAddress || !isActiveListingPublished) {
      setListingStatusError("Publish this launch before changing visibility.")
      return
    }
    if (!isLaunchRegistryConfigured) {
      setListingStatusError("Launch registry contract is not configured.")
      return
    }
    if (!connectorId || !account?.address) {
      setListingStatusError("Connect a wallet first.")
      return
    }

    try {
      setListingStatusSubmitting(status)
      setListingStatusError(undefined)
      setListingStatusTxHash("")
      startTx(
        status === "hidden"
          ? `Hide ${activeOwnerLaunch.symbol} listing`
          : `Restore ${activeOwnerLaunch.symbol} listing`
      )
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          buildUpdateLaunchMessage({
            sender: signerAddress,
            tokenContract: activeOwnerLaunch.contractAddress,
            status
          })
        ],
        "auto",
        status === "hidden"
          ? "Burrito hide launch"
          : "Burrito restore launch"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Update listing visibility failed")
      }

      setListingStatusTxHash(result.transactionHash)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                ownerStatus:
                  status === "hidden"
                    ? "Listing hidden"
                    : "Launch published",
                registryStatus: status,
                registryStatusTxHash: result.transactionHash
              }
            : record
        )
      )
      await refreshRegistryLaunches()
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Update listing visibility failed."
      setListingStatusError(message)
      failTx(message)
    } finally {
      setListingStatusSubmitting(null)
    }
  }

  return (
    <PageShell
      title="Launchpad"
      extra={<span className={styles.phasePill}>Phase 2 local draft</span>}
    >
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Burrito Launchpad V1</span>
          <h2>Launch a token with visible liquidity and a clear lock.</h2>
          <p>
            V1 should keep the launch model narrow: fixed-supply CW20, Token /
            LUNC pool, public creator address, visible LP lock, and plain risk
            labels without Burrito acting as a token judge.
          </p>
        </div>
        <div className={styles.heroPanel}>
          <div className={styles.panelTop}>
            <span>Recommended V1</span>
            <strong>CW20 / LUNC</strong>
          </div>
          <div className={styles.metricGrid}>
            <div>
              <span>DEX route</span>
              <strong>Terraswap</strong>
            </div>
            <div>
              <span>LP lock</span>
              <strong>30d min</strong>
            </div>
            <div>
              <span>Listing</span>
              <strong>Auto draft</strong>
            </div>
            <div>
              <span>Risk label</span>
              <strong>Open launch</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className={styles.tabBar} aria-label="Launchpad sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${
              activeTab === tab.id ? styles.tabButtonActive : ""
            }`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.eyebrow}</span>
            <strong>{tab.label}</strong>
          </button>
        ))}
      </nav>

      {activeTab === "create" ? (
        <section className={styles.createGrid}>
          <form className={`card ${styles.formCard}`}>
            <div className={styles.formHeader}>
              <div>
                <h3>Create token draft</h3>
                <p>
                  CW20 creation, pair creation, and initial liquidity are live.
                  LP locking remains the next contract step.
                </p>
              </div>
              <div className={styles.formHeaderActions}>
                <span className={styles.statusPill}>Saved locally</span>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={resetDraft}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className={styles.createStepper}>
              {createSteps.map((step) => {
                const active = step.id === activeCreateStep
                const done = createStepStatus[step.id].done
                return (
                  <button
                    key={step.id}
                    className={`${styles.createStepButton} ${
                      active ? styles.createStepButtonActive : ""
                    } ${done ? styles.createStepButtonDone : ""}`}
                    type="button"
                    onClick={() => setActiveCreateStep(step.id)}
                  >
                    <span>{step.eyebrow}</span>
                    <strong>{step.label}</strong>
                  </button>
                )
              })}
            </div>

            <div className={styles.modeGrid}>
              {modeOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.modeCard} ${
                    draft.mode === option.id ? styles.modeCardActive : ""
                  }`}
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, mode: option.id }))
                    if (option.id === "cw20" && activeCreateStep === "liquidity") {
                      setActiveCreateStep("safety")
                    }
                  }}
                >
                  <span>{option.label}</span>
                  <strong>{option.title}</strong>
                  <p>{option.text}</p>
                </button>
              ))}
            </div>

            {!activeStepStatus.done ? (
              <div className={styles.stepHint}>{activeStepStatus.hint}</div>
            ) : null}

            {activeCreateStep === "token" ? (
              <div className={styles.formSection}>
                <div className={styles.sectionLabel}>Token metadata</div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      value={draft.name}
                      onChange={updateDraft("name")}
                      placeholder="Burrito Token"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Symbol</span>
                    <input
                      value={draft.symbol}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          symbol: event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                        }))
                      }
                      placeholder="TACO"
                      maxLength={12}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Total supply</span>
                    <input
                      value={draft.supply}
                      onChange={updateDraft("supply")}
                      inputMode="decimal"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Decimals</span>
                    <input
                      value={draft.decimals}
                      onChange={updateDraft("decimals")}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <div className={styles.noticeBox}>
                  V1 uses fixed supply. Minting, tax, blacklist, and hidden
                  owner controls should not be part of the first version.
                </div>
              </div>
            ) : null}

            {activeCreateStep === "liquidity" && !isCw20Only ? (
              <div className={styles.formSection}>
                <div className={styles.sectionLabel}>Initial pool</div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Token supply for LP (%)</span>
                    <input
                      value={draft.tokenForPoolPercent}
                      onChange={updateDraft("tokenForPoolPercent")}
                      inputMode="decimal"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>LUNC liquidity</span>
                    <input
                      value={draft.luncLiquidity}
                      onChange={updateDraft("luncLiquidity")}
                      inputMode="decimal"
                    />
                  </label>
                  <div className={styles.readOnlyField}>
                    <span>Start price</span>
                    <strong>
                      {formatPrice(launchMath.startPriceLunc)} LUNC
                    </strong>
                  </div>
                  <div className={styles.readOnlyField}>
                    <span>Pair</span>
                    <strong>{tokenSymbol} / LUNC</strong>
                  </div>
                </div>
                <div className={styles.liquiditySplit}>
                  <div>
                    <span>LP allocation</span>
                    <strong>{formatCompact(launchMath.tokenForPool)}</strong>
                  </div>
                  <div>
                    <span>Creator reserve</span>
                    <strong>{formatCompact(launchMath.creatorReserve)}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {activeCreateStep === "liquidity" && isCw20Only ? (
              <div className={styles.formSection}>
                <div className={styles.sectionLabel}>Liquidity skipped</div>
                <div className={styles.noticeBox}>
                  CW20 only mode does not create a pool. This token will have no
                  price, no K-line, no recent trades, and no Swap route until a
                  separate pool is created and funded.
                </div>
                <div className={styles.cw20OnlyGrid}>
                  <div>
                    <span>Market status</span>
                    <strong>No pool</strong>
                  </div>
                  <div>
                    <span>Start price</span>
                    <strong>--</strong>
                  </div>
                  <div>
                    <span>Swap route</span>
                    <strong>Unavailable</strong>
                  </div>
                  <div>
                    <span>Use case</span>
                    <strong>Advanced token</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {activeCreateStep === "safety" ? (
              <div className={styles.formSection}>
                <div className={styles.sectionLabel}>Safety and public info</div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>LP lock days</span>
                    <input
                      value={draft.lockDays}
                      onChange={updateDraft("lockDays")}
                      inputMode="numeric"
                      disabled={isCw20Only}
                    />
                  </label>
                  <div className={styles.readOnlyField}>
                    <span>{isCw20Only ? "Token mode" : "Launch label"}</span>
                    <strong>{isCw20Only ? "CW20 only" : "Open launch"}</strong>
                  </div>
                </div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Website</span>
                    <input
                      value={draft.website}
                      onChange={updateDraft("website")}
                      placeholder="https://"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>X / Twitter</span>
                    <input
                      value={draft.xProfile}
                      onChange={updateDraft("xProfile")}
                      placeholder="@project"
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>Description</span>
                  <textarea
                    value={draft.description}
                    onChange={updateDraft("description")}
                    placeholder="Short public description shown before trading."
                    rows={4}
                  />
                </label>
                <div className={styles.safetyRulesMini}>
                  {(isCw20Only ? cw20OnlyChecklist : launchChecklist).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {activeCreateStep === "summary" ? (
              <div className={styles.formSection}>
                <div className={styles.sectionLabel}>Launch package summary</div>
                <div className={styles.reviewGrid}>
                  <div>
                    <span>Name</span>
                    <strong>{draft.name.trim() || "--"}</strong>
                  </div>
                  <div>
                    <span>Symbol</span>
                    <strong>{tokenSymbol}</strong>
                  </div>
                  <div>
                    <span>Supply</span>
                    <strong>{formatCompact(launchMath.supply)}</strong>
                  </div>
                  <div>
                    <span>Decimals</span>
                    <strong>{formatNumber(decimals, 0)}</strong>
                  </div>
                  <div>
                    <span>Initial liquidity</span>
                    <strong>
                      {isCw20Only
                        ? "No pool"
                        : `${formatCompact(launchMath.luncLiquidity)} LUNC`}
                    </strong>
                  </div>
                  <div>
                    <span>LP lock</span>
                    <strong>
                      {isCw20Only ? "Not used" : `${formatNumber(lockDays, 0)} days`}
                    </strong>
                  </div>
                  <div>
                    <span>Start price</span>
                    <strong>
                      {isCw20Only
                        ? "--"
                        : `${formatPrice(launchMath.startPriceLunc)} LUNC`}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{isCw20Only ? "CW20 only" : "Open launch"}</strong>
                  </div>
                </div>
                <div className={styles.noticeBox}>
                  CW20 only creates just the token contract. Launch with pool
                  still needs LP locking and a Burrito listing before it should
                  be treated as a complete public launch.
                </div>
                <label className={styles.confirmBox}>
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(event) =>
                      setRiskAcknowledged(event.target.checked)
                    }
                  />
                  <span>{riskConfirmationText}</span>
                </label>
              </div>
            ) : null}

            <div className={styles.stepActions}>
              <button
                className="uiButton uiButtonOutline"
                type="button"
                disabled={activeStepIsFirst}
                onClick={goToPreviousCreateStep}
              >
                Back
              </button>
              <button
                className="uiButton uiButtonPrimary"
                type="button"
                disabled={
                  !activeStepStatus.done ||
                  (activeStepIsLast && (!riskAcknowledged || createSubmitting))
                }
                onClick={
                  activeStepIsLast
                    ? handleCreateTokenContract
                    : goToNextCreateStep
                }
              >
                {activeStepIsLast
                  ? createSubmitting
                    ? "Broadcasting..."
                    : riskAcknowledged
                    ? isCw20Only
                      ? "Create CW20"
                      : "Create token and continue"
                    : "Confirm risks"
                  : "Next"}
              </button>
            </div>
          </form>

          <aside className={styles.previewStack}>
            <article className={`card ${styles.previewCard}`}>
              <div className={styles.launchTokenHeader}>
                <div className={styles.launchLogo}>{tokenSymbol.slice(0, 2)}</div>
                <div>
                  <span>Launch preview</span>
                  <strong>{isCw20Only ? tokenSymbol : `${tokenSymbol} / LUNC`}</strong>
                </div>
              </div>
              <div className={styles.previewStats}>
                <div>
                  <span>Start price</span>
                  <strong>
                    {isCw20Only ? "--" : `${formatPrice(launchMath.startPriceLunc)} LUNC`}
                  </strong>
                </div>
                <div>
                  <span>Token to LP</span>
                  <strong>
                    {isCw20Only ? "Not used" : formatCompact(launchMath.tokenForPool)}
                  </strong>
                </div>
                <div>
                  <span>Creator reserve</span>
                  <strong>{formatCompact(launchMath.creatorReserve)}</strong>
                </div>
                <div>
                  <span>Initial mcap</span>
                  <strong>{formatCompact(launchMath.startingMcapLunc)} LUNC</strong>
                </div>
              </div>
              <div className={styles.lockStrip}>
                <span>{isCw20Only ? "Token mode" : "LP lock"}</span>
                <strong>
                  {isCw20Only
                    ? "CW20 only"
                    : `${formatNumber(toNumber(draft.lockDays), 0)} days`}
                </strong>
              </div>
            </article>

            <article className={`card ${styles.readinessCard}`}>
              <div className={styles.progressHeader}>
                <div>
                  <span>Launch readiness</span>
                  <strong>{readiness.percent}%</strong>
                </div>
                <div className={styles.progressTrack}>
                  <i style={{ width: `${readiness.percent}%` }} />
                </div>
              </div>
              <div className={styles.checkList}>
                {readiness.items.map((item) => (
                  <div
                    className={`${styles.checkItem} ${
                      item.done ? styles.checkItemDone : ""
                    }`}
                    key={item.label}
                  >
                    <span />
                    {item.label}
                  </div>
                ))}
              </div>
              <button
                className={`uiButton uiButtonPrimary ${styles.fullButton}`}
                type="button"
                disabled={
                  createSubmitting ||
                  !canPreviewBuild ||
                  !riskAcknowledged
                }
                onClick={handleCreateTokenContract}
              >
                {createSubmitting
                  ? "Broadcasting..."
                  : canPreviewBuild
                  ? riskAcknowledged
                    ? isCw20Only
                      ? "Create CW20"
                      : "Create token and continue"
                    : "Risk confirmation needed"
                  : "Complete draft first"}
              </button>
              <div className={styles.codeIdLine}>
                <span>Contract code</span>
                <strong>{LAUNCHPAD_CW20_CODE_ID_LABEL}</strong>
              </div>
              {createError ? (
                <div className={styles.txError}>{createError}</div>
              ) : null}
              {createdToken ? (
                <div className={styles.txResult}>
                  <div>
                    <span>Tx</span>
                    <a
                      href={`https://finder.burrito.money/classic/tx/${createdToken.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {truncateHash(createdToken.hash)}
                    </a>
                  </div>
                  {createdToken.contractAddress ? (
                    <div>
                      <span>Token</span>
                      <a
                        href={`https://finder.burrito.money/classic/address/${createdToken.contractAddress}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {truncateHash(createdToken.contractAddress)}
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>

            <article className={`card ${styles.packageCard}`}>
              <div className={styles.planHeader}>
                <span>Transaction package</span>
                <h3>{isCw20Only ? "CW20 only" : "Launch with pool"}</h3>
              </div>
              <div className={styles.packageGrid}>
                {transactionPackageItems.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      ) : null}

      {activeTab === "create" ? (
        <section className={styles.launchPlanGrid}>
          <article className={`card ${styles.planCard}`}>
            <div className={styles.planHeader}>
              <span>Execution preview</span>
              <h3>What the real launch flow will build</h3>
            </div>
            <div className={styles.planList}>
              {transactionPlan.map((item, index) => (
                <div className={styles.planRow} key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={`card ${styles.recordCard}`}>
            <div className={styles.planHeader}>
              <span>Public record</span>
              <h3>What traders must see before buying</h3>
            </div>
            <div className={styles.recordList}>
              {publicRecordItems.map((item) => (
                <div key={item}>
                  <span>{item}</span>
                  <strong>Required</strong>
                </div>
              ))}
            </div>
            <div className={styles.warningList}>
              {launchWarnings.length ? (
                launchWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))
              ) : (
                <div>Draft inputs look reasonable for a V1 launch.</div>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "explore" ? (
        <section className={styles.exploreGrid}>
          <article className={`card ${styles.exploreIntro}`}>
            <div>
              <span>Launch discovery</span>
              <h3>Tokens created through Burrito will appear here first.</h3>
              <p>
                This section should show liquidity, lock status, creator address,
                public info status, and the Token / LUNC market before users trade.
              </p>
              {isLaunchRegistryConfigured ? (
                <p>
                  {registryLoading
                    ? "Loading on-chain registry..."
                    : registryError
                    ? `Registry error: ${registryError}`
                    : registeredLaunchCards.length
                    ? "Showing on-chain Burrito launches."
                    : "No registry launches found yet."}
                </p>
              ) : (
                <p>
                  {shouldShowSampleLaunches
                    ? "Registry contract is not configured yet; showing local sample cards only as product previews."
                    : "Registry contract is not configured yet. Public launch discovery is disabled until deployment."}
                </p>
              )}
              <div className={styles.launchStatsStrip}>
                <div>
                  <span>Total</span>
                  <strong>{launchStats.total}</strong>
                </div>
                <div>
                  <span>Live</span>
                  <strong>{launchStats.live}</strong>
                </div>
                <div>
                  <span>Risk</span>
                  <strong>{launchStats.risk}</strong>
                </div>
                <div>
                  <span>Unlocked</span>
                  <strong>{launchStats.ended}</strong>
                </div>
              </div>
            </div>
            <div className={styles.exploreControls}>
              <label className={styles.launchSearch}>
                <span>Search launches</span>
                <input
                  value={launchSearch}
                  onChange={(event) => setLaunchSearch(event.target.value)}
                  placeholder="Symbol, name, contract..."
                  spellCheck={false}
                />
              </label>
              <div className={styles.filterBar}>
                {launchFilters.map((filter) => (
                  <button
                    key={filter.id}
                    className={`${styles.filterButton} ${
                      activeLaunchFilter === filter.id
                        ? styles.filterButtonActive
                        : ""
                    }`}
                    type="button"
                    onClick={() => setActiveLaunchFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </article>
          {selectedLaunch ? (
            <article className={`card ${styles.launchDetailPanel}`}>
              <div className={styles.launchDetailHeader}>
                <div className={styles.launchCardTop}>
                  <div className={styles.launchLogo}>
                    {selectedLaunch.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <span>{selectedLaunch.status}</span>
                    <strong>{selectedLaunch.pair}</strong>
                    <p>{selectedLaunch.name}</p>
                  </div>
                </div>
                <div className={styles.riskLine}>{selectedLaunch.risk}</div>
              </div>
              <div className={styles.launchDetailGrid}>
                <div>
                  <span>Creator</span>
                  <strong>{selectedLaunch.creator}</strong>
                </div>
                <div>
                  <span>LP lock</span>
                  <strong>{selectedLaunch.lock}</strong>
                </div>
                <div>
                  <span>Registry</span>
                  <strong>
                    {selectedLaunch.registryLaunchId
                      ? `#${selectedLaunch.registryLaunchId}`
                      : "--"}
                  </strong>
                </div>
                <div>
                  <span>Token</span>
                  <strong>
                    {selectedLaunch.tokenContract
                      ? truncateHash(selectedLaunch.tokenContract)
                      : "--"}
                  </strong>
                </div>
                <div>
                  <span>Pair</span>
                  <strong>
                    {selectedLaunch.pairContract
                      ? truncateHash(selectedLaunch.pairContract)
                      : "--"}
                  </strong>
                </div>
                <div>
                  <span>Published</span>
                  <strong>
                    {selectedLaunch.createdAt
                      ? formatDateTime(selectedLaunch.createdAt * 1000)
                      : "--"}
                  </strong>
                </div>
              </div>
              <p className={styles.launchDescription}>
                {selectedLaunch.description ||
                  "No public description has been added yet. Treat this launch as higher risk until the creator publishes enough project information."}
              </p>
              <div className={styles.launchDetailActions}>
                {selectedLaunch.website ? (
                  <a
                    className="uiButton uiButtonOutline"
                    href={selectedLaunch.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </a>
                ) : null}
                {selectedLaunch.xProfile ? (
                  <a
                    className="uiButton uiButtonOutline"
                    href={selectedLaunch.xProfile}
                    target="_blank"
                    rel="noreferrer"
                  >
                    X profile
                  </a>
                ) : null}
                {selectedLaunch.tokenContract ? (
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    onClick={() =>
                      handleCopyText(selectedLaunch.tokenContract ?? "")
                    }
                  >
                    {copiedValue === selectedLaunch.tokenContract
                      ? "Copied"
                      : "Copy token"}
                  </button>
                ) : null}
                {selectedLaunch.tokenContract ? (
                  <a
                    className="uiButton uiButtonOutline"
                    href={`https://finder.burrito.money/classic/address/${selectedLaunch.tokenContract}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Token contract
                  </a>
                ) : null}
                {selectedLaunch.pairContract ? (
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    onClick={() =>
                      handleCopyText(selectedLaunch.pairContract ?? "")
                    }
                  >
                    {copiedValue === selectedLaunch.pairContract
                      ? "Copied"
                      : "Copy pair"}
                  </button>
                ) : null}
                {selectedLaunch.pairContract ? (
                  <Link
                    className="uiButton uiButtonPrimary"
                    to={`/market/pair/terraswap/${encodeURIComponent(
                      selectedLaunch.pairContract
                    )}`}
                  >
                    Open market
                  </Link>
                ) : null}
              </div>
              {copyError ? <div className={styles.txError}>{copyError}</div> : null}
            </article>
          ) : null}
          {filteredLaunches.map((item) => (
            <article className={`card ${styles.launchCard}`} key={item.id}>
              <div className={styles.launchCardTop}>
                <div className={styles.launchLogo}>{item.symbol.slice(0, 2)}</div>
                <div>
                  <span>
                    {item.sample ? "Sample preview" : item.status}
                  </span>
                  <strong>{item.pair}</strong>
                  <p>{item.name}</p>
                </div>
              </div>
              <div className={styles.launchCardStats}>
                <div>
                  <span>Liquidity</span>
                  <strong>{item.liquidity}</strong>
                </div>
                <div>
                  <span>LP lock</span>
                  <strong>{item.lock}</strong>
                </div>
                <div>
                  <span>Creator</span>
                  <strong>{item.creator}</strong>
                </div>
                <div>
                  <span>Launch</span>
                  <strong>{item.progress}%</strong>
                </div>
              </div>
              <div className={styles.launchProgress}>
                <i style={{ width: `${item.progress}%` }} />
              </div>
              <div className={styles.launchCardBottom}>
                <div className={styles.riskLine}>{item.risk}</div>
                <div className={styles.launchCardActions}>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    onClick={() => setSelectedLaunchId(item.id)}
                  >
                    Details
                  </button>
                  {item.pairContract ? (
                    <Link
                      className="uiButton uiButtonOutline"
                      to={`/market/pair/terraswap/${encodeURIComponent(
                        item.pairContract
                      )}`}
                    >
                      Market
                    </Link>
                  ) : item.tokenContract ? (
                    <a
                      className="uiButton uiButtonOutline"
                      href={`https://finder.burrito.money/classic/address/${item.tokenContract}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Token
                    </a>
                  ) : (
                    <button className="uiButton uiButtonOutline" type="button" disabled>
                      Preview
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!filteredLaunches.length ? (
            <article className={`card ${styles.emptyState}`}>
              <span>No launches</span>
              <strong>{exploreEmptyText}</strong>
            </article>
          ) : null}
        </section>
      ) : null}

      {activeTab === "manage" ? (
        <section className={styles.manageGrid}>
          <article className={`card ${styles.ownerIntro}`}>
            <div>
              <span>Creator dashboard</span>
              <h3>After launch, creators need maintenance tools.</h3>
              <p>
                The important point is that adding liquidity and extending locks
                should be easy. Withdrawals should be possible only after the lock
                expires, and the unlock date must stay visible to traders.
              </p>
            </div>
            <div className={styles.ownerControlPanel}>
              <div className={styles.ownerSelector}>
                {ownerRecords.length ? (
                  ownerRecords.map((launch) => (
                    <button
                      key={launch.id}
                      className={`${styles.ownerSelectButton} ${
                        activeOwnerLaunch?.id === launch.id
                          ? styles.ownerSelectButtonActive
                          : ""
                      }`}
                      type="button"
                      onClick={() => setActiveOwnerId(launch.id)}
                    >
                      <span>{launch.mode}</span>
                      <strong>{launch.pair}</strong>
                    </button>
                  ))
                ) : (
                  <div className={styles.ownerEmptyHint}>
                    Create a token or import an existing CW20 to unlock owner
                    tools.
                  </div>
                )}
              </div>
              <div className={styles.ownerSyncRow}>
                <button
                  className="uiButton uiButtonOutline"
                  type="button"
                  disabled={
                    syncSubmitting ||
                    !account?.address ||
                    !isLaunchRegistryConfigured
                  }
                  onClick={handleSyncOwnerLaunches}
                >
                  {syncSubmitting ? "Syncing..." : "Sync my launches"}
                </button>
                {syncError ? (
                  <span className={styles.ownerSyncError}>{syncError}</span>
                ) : syncResult ? (
                  <span className={styles.ownerSyncNote}>{syncResult}</span>
                ) : null}
              </div>
            </div>
          </article>

          <form
            className={`card ${styles.ownerImport}`}
            onSubmit={handleImportCw20}
          >
            <div>
              <span>Import token</span>
              <h3>Add an existing CW20</h3>
              <p>
                Paste a token contract address to recover its registry listing,
                Terraswap pair, and local creator tools.
              </p>
            </div>
            <div className={styles.importRow}>
              <input
                value={importAddress}
                onChange={(event) => setImportAddress(event.target.value)}
                placeholder="terra1..."
                spellCheck={false}
              />
              <button
                className="uiButton uiButtonPrimary"
                type="submit"
                disabled={importSubmitting}
              >
                {importSubmitting ? "Importing..." : "Import"}
              </button>
            </div>
            {importError ? (
              <div className={styles.txError}>{importError}</div>
            ) : null}
          </form>

          {activeOwnerLaunch ? (
            <article className={`card ${styles.ownerSummary}`}>
              <div className={styles.launchCardTop}>
                <div className={styles.launchLogo}>
                  {activeOwnerLaunch.symbol.slice(0, 2)}
                </div>
                <div>
                  <span>{activeOwnerLaunch.ownerStatus}</span>
                  <strong>{activeOwnerLaunch.pair}</strong>
                  <p>{activeOwnerLaunch.name}</p>
                </div>
              </div>
              <div className={styles.ownerSummaryGrid}>
                <div>
                  <span>Liquidity</span>
                  <strong>{activeOwnerLaunch.liquidity}</strong>
                </div>
                <div>
                  <span>LP unlock</span>
                  <strong>{activeOwnerLaunch.lockExpiry}</strong>
                </div>
                <div>
                  <span>Public info</span>
                  <strong>{activeOwnerLaunch.infoStatus}</strong>
                </div>
              </div>
              <div className={styles.ownerQuickActions}>
                {activeOwnerLaunch.contractAddress ? (
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    onClick={() =>
                      handleCopyText(activeOwnerLaunch.contractAddress ?? "")
                    }
                  >
                    {copiedValue === activeOwnerLaunch.contractAddress
                      ? "Copied"
                      : "Copy token"}
                  </button>
                ) : null}
                {activePairAddress ? (
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    onClick={() => handleCopyText(activePairAddress)}
                  >
                    {copiedValue === activePairAddress ? "Copied" : "Copy pair"}
                  </button>
                ) : null}
                {activeOwnerLaunch.contractAddress ? (
                  <a
                    className="uiButton uiButtonOutline"
                    href={`https://finder.burrito.money/classic/address/${activeOwnerLaunch.contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open token
                  </a>
                ) : null}
                {activePairAddress ? (
                  <Link
                    className="uiButton uiButtonPrimary"
                    to={`/market/pair/terraswap/${encodeURIComponent(
                      activePairAddress
                    )}`}
                  >
                    Open market
                  </Link>
                ) : null}
                <button
                  className="uiButton uiButtonOutline"
                  type="button"
                  disabled={!isActiveOwnerLocalRecord}
                  onClick={handleRemoveLocalRecord}
                >
                  Remove local record
                </button>
              </div>
              {copyError ? <div className={styles.txError}>{copyError}</div> : null}
              {localRecordNotice ? (
                <div className={styles.ownerSyncNote}>{localRecordNotice}</div>
              ) : null}
              {activeOwnerLaunch.contractAddress ||
              activeOwnerLaunch.txHash ||
              activeOwnerLaunch.lpLockTxHash ||
              activeOwnerLaunch.liquidityWithdrawTxHash ||
              activeOwnerLaunch.lpWithdrawTxHash ||
              activeOwnerLaunch.registryTxHash ||
              activeOwnerLaunch.registryLaunchId ||
              activeOwnerLaunch.registryUpdateTxHash ||
              activeOwnerLaunch.registryStatusTxHash ||
              activeOwnerLaunch.createdAt ? (
                <div className={styles.ownerLinkGrid}>
                  {activeOwnerLaunch.contractAddress ? (
                    <a
                      href={`https://finder.burrito.money/classic/address/${activeOwnerLaunch.contractAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Token contract</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.contractAddress)}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.txHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Create tx</span>
                      <strong>{truncateHash(activeOwnerLaunch.txHash)}</strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.createdAt ? (
                    <div>
                      <span>Created</span>
                      <strong>{formatDateTime(activeOwnerLaunch.createdAt)}</strong>
                    </div>
                  ) : null}
                  {activeOwnerLaunch.lpLockTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.lpLockTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>LP lock tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.lpLockTxHash)}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.lpWithdrawTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.lpWithdrawTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>LP withdraw tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.lpWithdrawTxHash)}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.liquidityWithdrawTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.liquidityWithdrawTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Remove LP tx</span>
                      <strong>
                        {truncateHash(
                          activeOwnerLaunch.liquidityWithdrawTxHash
                        )}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.registryTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.registryTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Publish tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.registryTxHash)}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.registryLaunchId ? (
                    <div>
                      <span>Registry ID</span>
                      <strong>#{activeOwnerLaunch.registryLaunchId}</strong>
                    </div>
                  ) : null}
                  {activeOwnerLaunch.registryUpdateTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.registryUpdateTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Update tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.registryUpdateTxHash)}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.registryStatusTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${activeOwnerLaunch.registryStatusTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Status tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.registryStatusTxHash)}
                      </strong>
                    </a>
                  ) : null}
                </div>
              ) : null}
            </article>
          ) : null}

          {activeOwnerLaunch ? (
            <article className={`card ${styles.poolSetup}`}>
              <div className={styles.planHeader}>
                <span>Pool setup</span>
                <h3>Terraswap LUNC pair</h3>
              </div>
              <div className={styles.poolStatusGrid}>
                <div>
                  <span>Status</span>
                  <strong>
                    {!activeTokenAddress
                      ? "No CW20 contract"
                      : activePairLookup.status === "loading"
                      ? "Checking..."
                      : activePairAddress
                      ? "Pair found"
                      : activePairLookup.status === "error"
                      ? "Lookup failed"
                      : "No pair yet"}
                  </strong>
                </div>
                <div>
                  <span>Factory</span>
                  <strong>{truncateHash(TERRASWAP_FACTORY_ADDRESS)}</strong>
                </div>
              </div>

              {activePairAddress || activeLiquidityToken ? (
                <div className={styles.ownerLinkGrid}>
                  {activePairAddress ? (
                    <a
                      href={`https://finder.burrito.money/classic/address/${activePairAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Pair contract</span>
                      <strong>{truncateHash(activePairAddress)}</strong>
                    </a>
                  ) : null}
                  {activeLiquidityToken ? (
                    <a
                      href={`https://finder.burrito.money/classic/address/${activeLiquidityToken}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>LP token</span>
                      <strong>{truncateHash(activeLiquidityToken)}</strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.pairTxHash || createPairTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${
                        activeOwnerLaunch.pairTxHash || createPairTxHash
                      }`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Pair tx</span>
                      <strong>
                        {truncateHash(
                          activeOwnerLaunch.pairTxHash || createPairTxHash
                        )}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.liquidityTxHash ||
                  provideLiquidityTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${
                        activeOwnerLaunch.liquidityTxHash ||
                        provideLiquidityTxHash
                      }`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Liquidity tx</span>
                      <strong>
                        {truncateHash(
                          activeOwnerLaunch.liquidityTxHash ||
                            provideLiquidityTxHash
                        )}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.liquidityWithdrawTxHash ||
                  withdrawLiquidityTxHash ? (
                    <a
                      href={`https://finder.burrito.money/classic/tx/${
                        activeOwnerLaunch.liquidityWithdrawTxHash ||
                        withdrawLiquidityTxHash
                      }`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Remove LP tx</span>
                      <strong>
                        {truncateHash(
                          activeOwnerLaunch.liquidityWithdrawTxHash ||
                            withdrawLiquidityTxHash
                        )}
                      </strong>
                    </a>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.noticeBox}>
                Creating a pair only opens the pool contract. Providing
                liquidity funds the market, but LP tokens stay unlocked until
                the lock contract is added.
              </div>

              {activePairLookup.status === "error" &&
              activePairLookup.error ? (
                <div className={styles.txError}>{activePairLookup.error}</div>
              ) : null}
              {createPairError ? (
                <div className={styles.txError}>{createPairError}</div>
              ) : null}
              {createPairTxHash && !activeOwnerLaunch.pairTxHash ? (
                <div className={styles.txResult}>
                  <div>
                    <span>Pair tx</span>
                    <a
                      href={`https://finder.burrito.money/classic/tx/${createPairTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {truncateHash(createPairTxHash)}
                    </a>
                  </div>
                </div>
              ) : null}

              <button
                className="uiButton uiButtonPrimary"
                type="button"
                disabled={!canCreatePair || createPairSubmitting}
                onClick={handleCreateTerraswapPair}
              >
                {createPairSubmitting
                  ? "Broadcasting..."
                  : activePairAddress
                  ? "Pair already exists"
                  : "Create LUNC pair"}
              </button>

              {activePairAddress ? (
                <form
                  className={styles.liquidityForm}
                  onSubmit={handleProvideLiquidity}
                >
                  <div className={styles.planHeader}>
                    <span>Liquidity</span>
                    <h3>Provide initial liquidity</h3>
                  </div>
                  <div className={styles.liquidityInputs}>
                    <label className={styles.field}>
                      <span>{activeOwnerLaunch.symbol} amount</span>
                      <input
                        value={liquidityTokenAmount}
                        onChange={(event) =>
                          setLiquidityTokenAmount(event.target.value)
                        }
                        placeholder="1000000"
                        inputMode="decimal"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>LUNC amount</span>
                      <input
                        value={liquidityLuncAmount}
                        onChange={(event) =>
                          setLiquidityLuncAmount(event.target.value)
                        }
                        placeholder="1000000"
                        inputMode="decimal"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Max slippage %</span>
                      <input
                        value={liquiditySlippage}
                        onChange={(event) =>
                          setLiquiditySlippage(event.target.value)
                        }
                        placeholder="1"
                        inputMode="decimal"
                      />
                    </label>
                    <div className={styles.readOnlyField}>
                      <span>Token decimals</span>
                      <strong>{activeTokenDecimals}</strong>
                    </div>
                  </div>
                  <div className={styles.noticeBox}>
                    This broadcasts two messages in one transaction: approve the
                    pair to spend the CW20 amount, then deposit CW20 + LUNC into
                    Terraswap.
                  </div>
                  {provideLiquidityError ? (
                    <div className={styles.txError}>
                      {provideLiquidityError}
                    </div>
                  ) : null}
                  {provideLiquidityTxHash ? (
                    <div className={styles.txResult}>
                      <div>
                        <span>Liquidity tx</span>
                        <a
                          href={`https://finder.burrito.money/classic/tx/${provideLiquidityTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {truncateHash(provideLiquidityTxHash)}
                        </a>
                      </div>
                    </div>
                  ) : null}
                  <button
                    className="uiButton uiButtonPrimary"
                    type="submit"
                    disabled={!canProvideLiquidity}
                  >
                    {provideLiquiditySubmitting
                      ? "Broadcasting..."
                      : !connectorId || !account?.address
                      ? "Connect wallet first"
                      : hasLiquidityInput
                      ? "Provide liquidity"
                      : "Enter liquidity amounts"}
                  </button>
                </form>
              ) : null}

              {activeLiquidityToken ? (
                <form
                  className={styles.liquidityForm}
                  onSubmit={handleWithdrawLiquidity}
                >
                  <div className={styles.planHeader}>
                    <span>Withdraw liquidity</span>
                    <h3>Remove unlocked LP from the pool</h3>
                  </div>
                  <div className={styles.liquidityInputs}>
                    <label className={styles.field}>
                      <span>LP token amount</span>
                      <input
                        value={withdrawLiquidityAmount}
                        onChange={(event) =>
                          setWithdrawLiquidityAmount(event.target.value)
                        }
                        placeholder="100"
                        inputMode="decimal"
                      />
                    </label>
                    <div className={`${styles.readOnlyField} ${styles.balanceField}`}>
                      <span>Wallet LP balance</span>
                      <strong>
                        {activeLpBalanceLookup.status === "loading"
                          ? "Checking..."
                          : activeLpBalanceDisplay}
                      </strong>
                      <button
                        className={styles.textButton}
                        type="button"
                        disabled={!hasActiveLpBalance}
                        onClick={() =>
                          setWithdrawLiquidityAmount(activeLpBalanceInputAmount)
                        }
                      >
                        Use full balance
                      </button>
                    </div>
                  </div>
                  <div className={styles.noticeBox}>
                    This sends unlocked LP tokens back to the Terraswap pair and
                    receives the underlying {activeOwnerLaunch.symbol} + LUNC.
                    Locked LP must be withdrawn from the locker first.
                  </div>
                  {withdrawLiquidityError ? (
                    <div className={styles.txError}>
                      {withdrawLiquidityError}
                    </div>
                  ) : null}
                  {withdrawLiquidityTxHash ? (
                    <div className={styles.txResult}>
                      <div>
                        <span>Remove LP tx</span>
                        <a
                          href={`https://finder.burrito.money/classic/tx/${withdrawLiquidityTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {truncateHash(withdrawLiquidityTxHash)}
                        </a>
                      </div>
                    </div>
                  ) : null}
                  <button
                    className="uiButton uiButtonOutline"
                    type="submit"
                    disabled={!canWithdrawLiquidity}
                  >
                    {withdrawLiquiditySubmitting
                      ? "Broadcasting..."
                      : !connectorId || !account?.address
                      ? "Connect wallet first"
                      : hasWithdrawLiquidityInput
                      ? "Withdraw liquidity"
                      : "Enter LP amount"}
                  </button>
                </form>
              ) : null}
            </article>
          ) : null}

          {activeOwnerLaunch ? (
            <article className={`card ${styles.lockSetup}`}>
              <div className={styles.planHeader}>
                <span>LP lock</span>
                <h3>Lock liquidity tokens</h3>
              </div>
              <div className={styles.poolStatusGrid}>
                <div>
                  <span>Locker</span>
                  <strong>
                    {isLpLockerConfigured
                      ? truncateHash(LAUNCHPAD_LP_LOCKER_ADDRESS)
                      : "Not configured"}
                  </strong>
                </div>
                <div>
                  <span>LP token</span>
                  <strong>
                    {!activeLiquidityToken
                      ? "No LP token"
                      : activeLpTokenLookup.status === "loading"
                      ? "Checking..."
                      : truncateHash(activeLiquidityToken)}
                  </strong>
                </div>
              </div>

              {!activeLiquidityToken ? (
                <div className={styles.noticeBox}>
                  Provide liquidity first. Terraswap will mint LP tokens to the
                  provider wallet, then this tool can lock those LP tokens.
                </div>
              ) : !isLpLockerConfigured ? (
                <div className={styles.noticeBox}>
                  LP lock is wired but disabled until the locker contract is
                  deployed and `VITE_LAUNCHPAD_LP_LOCKER_ADDRESS` is configured.
                </div>
              ) : (
                <>
                  <form className={styles.liquidityForm} onSubmit={handleLockLp}>
                    <div className={styles.liquidityInputs}>
                      <label className={styles.field}>
                        <span>LP token amount</span>
                        <input
                          value={lockLpAmount}
                          onChange={(event) =>
                            setLockLpAmount(event.target.value)
                          }
                          placeholder="100"
                          inputMode="decimal"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Lock days</span>
                        <input
                          value={lockLpDays}
                          onChange={(event) => setLockLpDays(event.target.value)}
                          placeholder="90"
                          inputMode="numeric"
                        />
                      </label>
                      <div className={styles.readOnlyField}>
                        <span>Unlock estimate</span>
                        <strong>{lockUnlockPreview}</strong>
                      </div>
                      <div className={styles.readOnlyField}>
                        <span>LP decimals</span>
                        <strong>{activeLpDecimals}</strong>
                      </div>
                      <div className={`${styles.readOnlyField} ${styles.balanceField}`}>
                        <span>Wallet LP balance</span>
                        <strong>
                          {activeLpBalanceLookup.status === "loading"
                            ? "Checking..."
                            : activeLpBalanceDisplay}
                        </strong>
                        <button
                          className={styles.textButton}
                          type="button"
                          disabled={!hasActiveLpBalance}
                          onClick={() =>
                            setLockLpAmount(activeLpBalanceInputAmount)
                          }
                        >
                          Use full balance
                        </button>
                      </div>
                    </div>
                    <div className={styles.noticeBox}>
                      This sends LP CW20 tokens to the Burrito locker contract.
                      The locker must reject withdrawals until the unlock time.
                    </div>
                    {activeLpTokenLookup.status === "error" &&
                    activeLpTokenLookup.error ? (
                      <div className={styles.txError}>
                        {activeLpTokenLookup.error}
                      </div>
                    ) : null}
                    {activeLpBalanceLookup.status === "error" &&
                    activeLpBalanceLookup.error ? (
                      <div className={styles.txError}>
                        {activeLpBalanceLookup.error}
                      </div>
                    ) : null}
                    {lockLpError ? (
                      <div className={styles.txError}>{lockLpError}</div>
                    ) : null}
                    {lockLpTxHash ? (
                      <div className={styles.txResult}>
                        <div>
                          <span>LP lock tx</span>
                          <a
                            href={`https://finder.burrito.money/classic/tx/${lockLpTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {truncateHash(lockLpTxHash)}
                          </a>
                        </div>
                      </div>
                    ) : null}
                    <button
                      className="uiButton uiButtonPrimary"
                      type="submit"
                      disabled={!canLockLp}
                    >
                      {lockLpSubmitting
                        ? "Broadcasting..."
                        : !connectorId || !account?.address
                        ? "Connect wallet first"
                        : hasLockInput
                        ? "Lock LP"
                        : "Enter LP lock details"}
                    </button>
                  </form>

                  {activeOwnerLaunch.lpLockId ? (
                    <div className={styles.lockedLpPanel}>
                      <div className={styles.planHeader}>
                        <span>Locked position</span>
                        <h3>Withdraw after unlock</h3>
                      </div>
                      <div className={styles.poolStatusGrid}>
                        <div>
                          <span>Lock ID</span>
                          <strong>{activeOwnerLaunch.lpLockId}</strong>
                        </div>
                        <div>
                          <span>Status</span>
                          <strong>
                            {activeOwnerLaunch.lpWithdrawTxHash
                              ? "Withdrawn"
                              : activeLpLockHasExpired
                              ? "Unlocked"
                              : "Locked"}
                          </strong>
                        </div>
                      </div>
                      {withdrawLpError ? (
                        <div className={styles.txError}>{withdrawLpError}</div>
                      ) : null}
                      {withdrawLpTxHash ? (
                        <div className={styles.txResult}>
                          <div>
                            <span>Withdraw tx</span>
                            <a
                              href={`https://finder.burrito.money/classic/tx/${withdrawLpTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {truncateHash(withdrawLpTxHash)}
                            </a>
                          </div>
                        </div>
                      ) : null}
                      <button
                        className="uiButton uiButtonOutline"
                        type="button"
                        disabled={
                          !canWithdrawLockedLp ||
                          Boolean(activeOwnerLaunch.lpWithdrawTxHash)
                        }
                        onClick={handleWithdrawLockedLp}
                      >
                        {withdrawLpSubmitting
                          ? "Broadcasting..."
                          : activeOwnerLaunch.lpWithdrawTxHash
                          ? "LP withdrawn"
                          : activeLpLockHasExpired
                          ? "Withdraw locked LP"
                          : "Waiting for unlock"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          ) : null}

          {activeOwnerLaunch ? (
            <article className={`card ${styles.listingSetup}`}>
              <div className={styles.planHeader}>
                <span>Public listing</span>
                <h3>Publish to Launchpad</h3>
              </div>
              <div className={styles.poolStatusGrid}>
                <div>
                  <span>Registry</span>
                  <strong>
                    {isLaunchRegistryConfigured
                      ? truncateHash(LAUNCHPAD_REGISTRY_ADDRESS)
                      : "Not configured"}
                  </strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>
                    {isActiveListingPublished
                      ? activeRegistryStatus === "hidden"
                        ? "Hidden, editable"
                        : "Published, editable"
                      : hasPublicListingPrerequisites
                      ? "Ready"
                      : "Needs LP lock"}
                  </strong>
                </div>
              </div>

              {!isLaunchRegistryConfigured ? (
                <div className={styles.noticeBox}>
                  Public listing is wired but disabled until the registry
                  contract is deployed and `VITE_LAUNCHPAD_REGISTRY_ADDRESS` is
                  configured.
                </div>
              ) : !hasPublicListingPrerequisites && !isActiveListingPublished ? (
                <div className={styles.noticeBox}>
                  A public listing requires token contract, LUNC pair, LP token,
                  LP lock id, and unlock time. Finish pool setup and LP lock
                  first.
                </div>
              ) : (
                <form className={styles.liquidityForm} onSubmit={handlePublishListing}>
                  <div className={styles.liquidityInputs}>
                    <label className={styles.field}>
                      <span>Website</span>
                      <input
                        value={publishWebsite}
                        onChange={(event) => setPublishWebsite(event.target.value)}
                        placeholder="https://..."
                        inputMode="url"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>X profile</span>
                      <input
                        value={publishXProfile}
                        onChange={(event) =>
                          setPublishXProfile(event.target.value)
                        }
                        placeholder="https://x.com/..."
                        inputMode="url"
                      />
                    </label>
                    <label className={`${styles.field} ${styles.fullField}`}>
                      <span>Description</span>
                      <textarea
                        value={publishDescription}
                        onChange={(event) =>
                          setPublishDescription(event.target.value)
                        }
                        placeholder="Short public description for launch discovery."
                      />
                    </label>
                  </div>
                  <div className={styles.noticeBox}>
                    {isActiveListingPublished
                      ? "This updates the public website, X profile, and description stored in the Burrito registry."
                      : "This publishes public facts to the Burrito registry contract. It does not verify the project or make Burrito an auditor."}
                  </div>
                  {publishError ? (
                    <div className={styles.txError}>{publishError}</div>
                  ) : null}
                  {publishTxHash ? (
                    <div className={styles.txResult}>
                      <div>
                        <span>
                          {isActiveListingPublished ? "Update tx" : "Publish tx"}
                        </span>
                        <a
                          href={`https://finder.burrito.money/classic/tx/${publishTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {truncateHash(publishTxHash)}
                        </a>
                      </div>
                    </div>
                  ) : null}
                  <button
                    className="uiButton uiButtonPrimary"
                    type="submit"
                    disabled={!canPublishListing}
                  >
                    {publishSubmitting
                      ? "Broadcasting..."
                      : isActiveListingPublished
                      ? "Update listing"
                      : !connectorId || !account?.address
                      ? "Connect wallet first"
                      : "Publish listing"}
                  </button>
                  {isActiveListingPublished ? (
                    <div className={styles.visibilityPanel}>
                      <div>
                        <span>Listing visibility</span>
                        <strong>
                          {activeRegistryStatus === "hidden"
                            ? "Hidden from Explore"
                            : "Visible in Explore"}
                        </strong>
                      </div>
                      {listingStatusError ? (
                        <div className={styles.txError}>
                          {listingStatusError}
                        </div>
                      ) : null}
                      {listingStatusTxHash ? (
                        <div className={styles.txResult}>
                          <div>
                            <span>Status tx</span>
                            <a
                              href={`https://finder.burrito.money/classic/tx/${listingStatusTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {truncateHash(listingStatusTxHash)}
                            </a>
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.visibilityActions}>
                        <button
                          className="uiButton uiButtonOutline"
                          type="button"
                          disabled={
                            activeRegistryStatus === "hidden" ||
                            listingStatusSubmitting !== null
                          }
                          onClick={() => handleSetListingStatus("hidden")}
                        >
                          {listingStatusSubmitting === "hidden"
                            ? "Broadcasting..."
                            : "Hide listing"}
                        </button>
                        <button
                          className="uiButton uiButtonOutline"
                          type="button"
                          disabled={
                            activeRegistryStatus === "live" ||
                            listingStatusSubmitting !== null
                          }
                          onClick={() => handleSetListingStatus("live")}
                        >
                          {listingStatusSubmitting === "live"
                            ? "Broadcasting..."
                            : "Restore listing"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </form>
              )}
            </article>
          ) : null}

          <article className={`card ${styles.ownerAction}`}>
            <div>
              <span>Next required action</span>
              <h3>Keep creator controls separate from trader screens.</h3>
              <p>
                Traders should only see public launch facts. Project owners need
                authenticated controls for metadata, liquidity, locks, and public notes.
              </p>
            </div>
          </article>

          {futureOwnerActions.map((action) => (
            <article className={`card ${styles.ownerAction}`} key={action.title}>
              <div>
                <span>Future owner tool</span>
                <h3>{action.title}</h3>
                <p>{action.text}</p>
              </div>
              <button className="uiButton uiButtonOutline" type="button" disabled>
                Coming later
              </button>
            </article>
          ))}
        </section>
      ) : null}

      <section className={styles.rulesCard}>
        <div>
          <span>V1 rules</span>
          <strong>Keep the first launchpad version strict.</strong>
        </div>
        <ul>
          {launchChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </PageShell>
  )
}

export default Launchpad
