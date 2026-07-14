import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react"
import { Link, useSearchParams } from "react-router-dom"
import PageShell from "../PageShell"
import styles from "../Launchpad.module.css"
import {
  buildCw20InstantiateMessage,
  buildCw20TransferMessage,
  extractContractAddressFromEvents,
  formatBaseUnitsToTokenAmount
} from "../../app/launchpad/cw20"
import {
  buildCreateTerraswapLuncPairMessage,
  fetchTerraswapLuncPair,
  waitForTerraswapLuncPair
} from "../../app/launchpad/pool"
import {
  buildLockLpMessage,
  buildWithdrawLockedLpMessage,
  extractLpLockIdFromEvents,
  fetchLpLock,
  getLpUnlockTimestampSeconds,
  parseLpAmountToBaseUnits,
  type LpLockResponse
} from "../../app/launchpad/locker"
import {
  buildRegisterLaunchMessage,
  buildUpdateLaunchMessage,
  extractRegistryLaunchIdFromEvents,
  fetchLaunchRegistryLaunches,
  type LaunchRegistryLaunch
} from "../../app/launchpad/registry"
import { useAppChain } from "../../app/appChainContext"
import {
  getLaunchpadConfig,
  isLaunchRegistryConfigured as getIsLaunchRegistryConfigured,
  isLpLockerConfigured as getIsLpLockerConfigured
} from "../../app/config/launchpadConfig"
import { useWallet } from "../../app/wallet/WalletContext"
import { useResolvedCw20Whitelist } from "../../app/data/terraAssets"
import { submitRegistryDiscovery } from "../../app/data/tokenRegistry"
import {
  connectClassicSigningClientForConnector,
  getSignerAddressForConnector
} from "../../app/wallet/walletAdapters"
import { truncateHash } from "../../app/utils/format"
import { formatTxError } from "../../app/utils/txError"
import { getAddressExplorerUrl, getTxExplorerUrl } from "../../app/explorer"
import { queryContractSmart } from "../../app/data/classic"
import LaunchCreateForm from "./LaunchCreateForm"
import LaunchCreatePreview from "./LaunchCreatePreview"
import LaunchDistributionTool from "./LaunchDistributionTool"
import LaunchExplorePanel from "./LaunchExplorePanel"
import LaunchManageOverview from "./LaunchManageOverview"
import LaunchpadTabs from "./LaunchpadTabs"
import {
  CW20_SYMBOL_PATTERN,
  TERRA_TOKEN_DECIMALS,
  buildLaunchpadCreationFeeMessage,
  buildOwnerRecordFromRegistryLaunch,
  createSteps,
  formatCompact,
  formatDateTime,
  formatNumber,
  getDistributionTotalAmount,
  getDraftStorageKey,
  getLaunchpadMarketPath,
  getManageSectionFromTarget,
  initialDraft,
  launchRiskRank,
  loadCreatedLaunches,
  loadStoredDraft,
  mergeRecoveredOwnerRecord,
  normalizeLaunchTab,
  normalizeOptionalHttpUrl,
  normalizeOptionalImageUrl,
  normalizeOptionalXProfile,
  ownerLaunches,
  parseDistributionTransfers,
  saveCreatedLaunches,
  toNumber,
  type CreateStep,
  type Cw20BalanceResponse,
  type Cw20DistributionTransfer,
  type Cw20TokenInfo,
  type DraftLaunch,
  type LaunchCardItem,
  type LaunchFilter,
  type LaunchSort,
  type LaunchTab,
  type ManageSection,
  type OwnerLaunchRecord,
  type OwnerNextAction,
  type PairLookupState,
  type TokenBalanceLookupState,
  type TokenInfoLookupState
} from "../../app/launchpad/pageModel"

const Launchpad = () => {
  const { chainKey, chain } = useAppChain()
  const launchpadConfig = getLaunchpadConfig(chainKey)
  const nativeSymbol = chain.displayDenom
  const isLpLockerConfigured = getIsLpLockerConfigured(chainKey)
  const isLaunchRegistryConfigured =
    getIsLaunchRegistryConfigured(chainKey)
  const LAUNCHPAD_LP_LOCKER_ADDRESS = launchpadConfig.lpLockerAddress
  const LAUNCHPAD_REGISTRY_ADDRESS = launchpadConfig.registryAddress
  const TERRASWAP_FACTORY_ADDRESS =
    launchpadConfig.terraswapFactoryAddress
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<LaunchTab>(
    () => normalizeLaunchTab(searchParams.get("tab")) ?? "create"
  )
  const [activeCreateStep, setActiveCreateStep] =
    useState<CreateStep>("token")
  const [activeLaunchFilter, setActiveLaunchFilter] =
    useState<LaunchFilter>("all")
  const [launchSort, setLaunchSort] = useState<LaunchSort>("newest")
  const [launchSearch, setLaunchSearch] = useState("")
  const [selectedLaunchId, setSelectedLaunchId] = useState(
    () => searchParams.get("launch") ?? ""
  )
  const [activeOwnerId, setActiveOwnerId] = useState("")
  const [activeManageSection, setActiveManageSection] =
    useState<ManageSection>("pool")
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
  const [lockLpAmount, setLockLpAmount] = useState("")
  const [lockLpDays, setLockLpDays] = useState("90")
  const [lockLpSubmitting, setLockLpSubmitting] = useState(false)
  const [lockLpError, setLockLpError] = useState<string>()
  const [lockLpTxHash, setLockLpTxHash] = useState("")
  const [lockRegistrySubmitting, setLockRegistrySubmitting] = useState(false)
  const [lockRegistryError, setLockRegistryError] = useState<string>()
  const [lockRegistryTxHash, setLockRegistryTxHash] = useState("")
  const [withdrawLpSubmitting, setWithdrawLpSubmitting] = useState(false)
  const [withdrawLpError, setWithdrawLpError] = useState<string>()
  const [withdrawLpTxHash, setWithdrawLpTxHash] = useState("")
  const [distributionInput, setDistributionInput] = useState("")
  const [distributionSubmitting, setDistributionSubmitting] = useState(false)
  const [distributionError, setDistributionError] = useState<string>()
  const [distributionTxHash, setDistributionTxHash] = useState("")
  const [registryLaunches, setRegistryLaunches] = useState<
    LaunchRegistryLaunch[]
  >([])
  const [registryLpLocks, setRegistryLpLocks] = useState<
    Record<string, LpLockResponse | null>
  >({})
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

  const handleSelectTab = (tab: LaunchTab) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    if (tab === "create") {
      next.delete("tab")
    } else {
      next.set("tab", tab)
    }
    if (tab !== "explore") {
      next.delete("launch")
    }
    setSearchParams(next)
  }

  const handleSelectLaunch = (launchId: string) => {
    setSelectedLaunchId(launchId)
    const next = new URLSearchParams(searchParams)
    next.set("tab", "explore")
    next.set("launch", launchId)
    setSearchParams(next)
    window.requestAnimationFrame(() => {
      document.getElementById("launchpad-selected-launch")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      })
    })
  }

  const scrollToManageSection = (targetId?: string) => {
    const section = getManageSectionFromTarget(targetId)
    if (section) setActiveManageSection(section)
    window.setTimeout(() => {
      document.getElementById(targetId ?? "launchpad-manage-tools")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      })
    }, 0)
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
  const decimals = TERRA_TOKEN_DECIMALS
  const lockDaysIsWhole = Number.isInteger(lockDays)
  const launchLockDaysValid =
    isCw20Only || (lockDaysIsWhole && lockDays >= 30 && lockDays <= 3650)
  const launchLockDaysError =
    !isCw20Only && draft.lockDays.trim()
      ? !lockDaysIsWhole
        ? "LP lock days must be a whole number."
        : lockDays < 30
          ? "Minimum LP lock is 30 days."
          : lockDays > 3650
            ? "Maximum LP lock is 3650 days."
            : ""
      : ""
  const normalizedDraftSymbol = draft.symbol.trim().toUpperCase()
  const symbolIsValid = CW20_SYMBOL_PATTERN.test(normalizedDraftSymbol)
  const symbolError =
    draft.symbol.trim() && !symbolIsValid
      ? "Use 3-12 letters or hyphens only. Numbers are not supported."
      : ""
  const registryTokenContracts = useMemo(
    () => registryLaunches.map((launch) => launch.token_contract),
    [registryLaunches]
  )
  const registryTokenMetadata = useResolvedCw20Whitelist(registryTokenContracts)

  const readiness = useMemo(() => {
    const baseItems = [
      {
        label: "Token name",
        done: draft.name.trim().length >= 3
      },
      {
        label: "Symbol",
        done: symbolIsValid
      },
      {
        label: "Supply",
        done: launchMath.supply > 0
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
        label: "Public info",
        done: Boolean(draft.website.trim() || draft.description.trim())
      },
      {
        label: "Pool liquidity",
        done: launchMath.luncLiquidity > 0 && launchMath.poolPercent >= 10
      },
      {
        label: "LP lock",
        done: launchLockDaysValid
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
    draft.description,
    draft.name,
    draft.website,
    isCw20Only,
    launchLockDaysValid,
    launchMath.luncLiquidity,
    launchMath.poolPercent,
    launchMath.supply,
    symbolIsValid
  ])

  const canPreviewBuild = readiness.percent === 100
  const tokenStepDone =
    draft.name.trim().length >= 3 &&
    symbolIsValid &&
    launchMath.supply > 0
  const liquidityStepDone =
    isCw20Only ||
    launchMath.luncLiquidity > 0 &&
    launchMath.poolPercent >= 10 &&
    launchMath.poolPercent <= 100 &&
    launchMath.tokenForPool > 0
  const safetyStepDone =
    isCw20Only ||
    (launchLockDaysValid && Boolean(draft.website.trim() || draft.description.trim()))
  const createStepStatus = {
    token: {
      done: tokenStepDone,
      hint: "Add a valid name, 3-12 letter symbol, and supply."
    },
    launch: {
      done: liquidityStepDone && safetyStepDone && readiness.percent === 100,
      hint: isCw20Only
        ? "CW20 only skips pool and public launch listing. Use it only for standalone tokens."
        : "Set liquidity, public info, and at least a 30 day LP lock before launch setup."
    }
  } satisfies Record<CreateStep, { done: boolean; hint: string }>
  const activeCreateStepIndex = createSteps.findIndex(
    (step) => step.id === activeCreateStep
  )
  const activeStepStatus = createStepStatus[activeCreateStep]
  const activeStepIsLast = activeCreateStepIndex >= createSteps.length - 1

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft))
    } catch {
      // Local draft persistence is a convenience layer, not a blocker.
    }
  }, [draft])

  useEffect(() => {
    saveCreatedLaunches(createdLaunches)
  }, [createdLaunches])

  useEffect(() => {
    setDraft(loadStoredDraft())
    setCreatedLaunches(loadCreatedLaunches())
    setSelectedLaunchId("")
    setCreatedToken(undefined)
    setCreateError(undefined)
  }, [chainKey])

  useEffect(() => {
    const urlTab = normalizeLaunchTab(searchParams.get("tab")) ?? "create"
    const urlLaunchId = searchParams.get("launch") ?? ""
    setActiveTab((current) => (current === urlTab ? current : urlTab))
    setSelectedLaunchId((current) =>
      current === urlLaunchId ? current : urlLaunchId
    )
  }, [searchParams])

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
  }, [chainKey, isLaunchRegistryConfigured])

  useEffect(() => {
    if (!isLpLockerConfigured || !registryLaunches.length) return
    const missingLockIds = registryLaunches
      .map((launch) => launch.lp_lock_id)
      .filter((lockId) => lockId && !(lockId in registryLpLocks))
      .slice(0, 50)
    if (!missingLockIds.length) return

    let cancelled = false
    Promise.all(
      missingLockIds.map(async (lockId) => {
        try {
          return [lockId, await fetchLpLock(lockId)] as const
        } catch {
          return [lockId, null] as const
        }
      })
    ).then((entries) => {
      if (cancelled) return
      setRegistryLpLocks((current) => {
        const next = { ...current }
        entries.forEach(([lockId, lock]) => {
          next[lockId] = lock
        })
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [chainKey, isLpLockerConfigured, registryLaunches, registryLpLocks])

  const resetDraft = () => {
    setDraft(initialDraft)
    setActiveCreateStep("token")
    setRiskAcknowledged(false)
    setCreateError(undefined)
    setCreatedToken(undefined)
  }

  const handleCreateTokenContract = async (
    mode: "token-only" | "full-launch" = "full-launch"
  ) => {
    const requiresFullLaunch = mode === "full-launch"
    if (requiresFullLaunch && (!riskAcknowledged || !canPreviewBuild)) {
      setCreateError("Complete the launch setup and confirm the risk notice first.")
      return
    }
    if (!requiresFullLaunch && !tokenStepDone) {
      setCreateError("Complete token name, symbol, and supply first.")
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
      const normalizedWebsite = normalizeOptionalHttpUrl(
        draft.website,
        "Website"
      )
      const normalizedXProfile = normalizeOptionalXProfile(draft.xProfile)
      const normalizedLogoUrl = normalizeOptionalImageUrl(draft.logoUrl)
      startTx(`Create ${tokenSymbol}`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const creationFeeMessage = buildLaunchpadCreationFeeMessage(signerAddress)
      const createTokenMessage = buildCw20InstantiateMessage(
        {
          creatorAddress: signerAddress,
          name: draft.name,
          symbol: tokenSymbol,
          supply: draft.supply,
          decimals,
          logoUrl: normalizedLogoUrl,
          website: normalizedWebsite,
          description: draft.description
        },
        `Burrito ${tokenSymbol}`
      )
      const result = await client.signAndBroadcast(
        signerAddress,
        [creationFeeMessage, createTokenMessage],
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
          ? `${tokenSymbol} / ${nativeSymbol}`
          : `${tokenSymbol} standalone`,
        liquidity: isLaunchWithPool
          ? `${formatCompact(launchMath.luncLiquidity)} ${nativeSymbol} planned`
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
        creatorAddress: signerAddress,
        contractAddress,
        txHash: result.transactionHash,
        decimals,
        totalSupply: draft.supply,
        website: normalizedWebsite,
        xProfile: normalizedXProfile,
        description: draft.description.trim(),
        logoUrl: normalizedLogoUrl,
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
      handleSelectTab("manage")
      finishTx(result.transactionHash)
      if (contractAddress) {
        void submitRegistryDiscovery({
          chainKey,
          contractAddress,
          txHash: result.transactionHash
        }).catch(() => false)
      }
    } catch (error) {
      const message = formatTxError(error, "Create token failed")
      setCreateError(message)
      failTx(message)
    } finally {
      setCreateSubmitting(false)
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

  const registeredLaunchCards = useMemo(
    () =>
      [...registryLaunches]
        .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
        .filter((launch) => launch.status !== "hidden")
        .map<LaunchCardItem>((launch) => {
          const nowSeconds = Math.floor(Date.now() / 1000)
          const tokenMeta =
            registryTokenMetadata.data?.[launch.token_contract.toLowerCase()]
          const symbol = (
            launch.metadata.symbol ||
            tokenMeta?.symbol ||
            "TOKEN"
          ).toUpperCase()
          const name = launch.metadata.name || tokenMeta?.name || symbol
          const lpLock = registryLpLocks[launch.lp_lock_id]
          const lpWithdrawn = Boolean(lpLock?.withdrawn)
          const unlockDays = Math.max(
            0,
            Math.ceil((launch.lp_unlock_time - nowSeconds) / 86400)
          )
          const hasPublicInfo = Boolean(
            launch.metadata.website || launch.metadata.description
          )
          const state: Exclude<LaunchFilter, "all"> =
            lpWithdrawn
              ? "risk"
              : unlockDays <= 0
              ? "ended"
              : hasPublicInfo
              ? "live"
              : "risk"
          const status =
            lpWithdrawn
              ? "LP withdrawn"
              : state === "ended"
              ? "LP unlocked"
              : state === "risk"
              ? "Needs public info"
              : "Published launch"
          const lockedLpAmount = lpLock
            ? `${formatBaseUnitsToTokenAmount(lpLock.amount, 6, 2)} LP`
            : undefined
          return {
            id: `registry-${launch.id}`,
            symbol,
            name,
            pair: `${symbol} / ${nativeSymbol}`,
            state,
            status,
            liquidity: lockedLpAmount ?? "On-chain LP",
            lock: unlockDays > 0 ? `${unlockDays} days` : "Unlocked",
            creator: truncateHash(launch.creator),
            risk: lpWithdrawn
              ? "LP withdrawn"
              : unlockDays <= 0
              ? "LP unlocked"
              : hasPublicInfo
              ? "LP locked"
              : "Public info incomplete",
            progress: lpWithdrawn ? 20 : 100,
            tokenContract: launch.token_contract,
            pairContract: launch.pair_contract,
            registryLaunchId: launch.id,
            lpLockId: launch.lp_lock_id,
            lockedLpAmount,
            lpWithdrawn,
            website: launch.metadata.website,
            xProfile: launch.metadata.x_profile,
            description: launch.metadata.description,
            logoUrl: tokenMeta?.icon,
            createdAt: launch.created_at,
            unlockTime: launch.lp_unlock_time
          }
        }),
    [nativeSymbol, registryLaunches, registryLpLocks, registryTokenMetadata.data]
  )
  const launchSource = registeredLaunchCards
  const normalizedLaunchSearch = launchSearch.trim().toLowerCase()
  const filteredLaunches = launchSource
    .filter((launch) => {
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
    .sort((a, b) => {
      if (launchSort === "oldest") {
        return (a.createdAt ?? 0) - (b.createdAt ?? 0)
      }
      if (launchSort === "unlockSoon") {
        return (a.unlockTime ?? Number.MAX_SAFE_INTEGER) -
          (b.unlockTime ?? Number.MAX_SAFE_INTEGER)
      }
      if (launchSort === "unlockLong") {
        return (b.unlockTime ?? 0) - (a.unlockTime ?? 0)
      }
      if (launchSort === "risk") {
        return (
          launchRiskRank(a) - launchRiskRank(b) ||
          (b.createdAt ?? 0) - (a.createdAt ?? 0)
        )
      }
      return (b.createdAt ?? 0) - (a.createdAt ?? 0)
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
  const connectedOwnerAddress = account?.address?.trim().toLowerCase() ?? ""
  const allOwnerRecords = useMemo(
    () => [...createdLaunches, ...ownerLaunches],
    [createdLaunches]
  )
  const ownerRecords = useMemo(() => {
    if (!connectedOwnerAddress) return []
    return allOwnerRecords.filter(
      (record) =>
        record.creatorAddress?.trim().toLowerCase() === connectedOwnerAddress
    )
  }, [allOwnerRecords, connectedOwnerAddress])
  const hiddenLocalRecordCount = connectedOwnerAddress
    ? allOwnerRecords.length - ownerRecords.length
    : 0
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
  const activeOwnerIsCw20Only = Boolean(
    activeOwnerLaunch?.mode.toLowerCase().includes("cw20 only")
  )
  const isActiveOwnerLocalRecord = Boolean(
    activeOwnerLaunch &&
      createdLaunches.some((record) => record.id === activeOwnerLaunch.id)
  )
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
  const distributionPreview = useMemo(() => {
    try {
      const transfers = parseDistributionTransfers(
        distributionInput,
        activeTokenDecimals,
        activeOwnerLaunch?.symbol ?? "TOKEN"
      )
      return {
        transfers,
        error: "",
        totalAmount: getDistributionTotalAmount(transfers, activeTokenDecimals)
      }
    } catch (error) {
      return {
        transfers: [] as Cw20DistributionTransfer[],
        error:
          error instanceof Error
            ? error.message
            : "Distribution list is invalid.",
        totalAmount: "--"
      }
    }
  }, [activeOwnerLaunch?.symbol, activeTokenDecimals, distributionInput])
  const canCreatePair =
    Boolean(activeTokenAddress) &&
    !activePairAddress &&
    activePairLookup.status !== "loading"
  const canDistributeTokens = Boolean(
    activeTokenAddress &&
      connectorId &&
      account?.address &&
      distributionPreview.transfers.length &&
      !distributionPreview.error &&
      !distributionSubmitting
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
  const activeLpLockUpdateTime = activeOwnerLaunch?.lpUnlockAt
    ? Math.floor(new Date(activeOwnerLaunch.lpUnlockAt).getTime() / 1000)
    : 0
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
  const canUpdateRegistryLock = Boolean(
    activeOwnerLaunch?.contractAddress &&
      activeOwnerLaunch?.lpLockId &&
      activeLpLockUpdateTime > Math.floor(Date.now() / 1000) &&
      isActiveListingPublished &&
      isLaunchRegistryConfigured &&
      connectorId &&
      account?.address &&
      !lockRegistrySubmitting
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
      `${activeOwnerLaunch.pair} was removed from local browser storage. On-chain data is unchanged. Published launches can be restored with Sync.`
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
  const hasProvidedLiquidity = Boolean(
    activeOwnerLaunch?.liquidityTxHash ||
      activeOwnerLaunch?.lpLockId ||
      isActiveListingPublished ||
      hasActiveLpBalance
  )
  const hasLockedLp = Boolean(
    activeOwnerLaunch?.lpLockId && activeOwnerLaunch.lpUnlockAt
  )
  const hasDistributedTokens = Boolean(
    activeOwnerLaunch?.distributionTxHash || distributionTxHash
  )
  const activeOwnerReadiness = activeOwnerLaunch
    ? activeOwnerIsCw20Only
      ? [
          {
            label: "Token",
            done: Boolean(activeOwnerLaunch.contractAddress),
            value: activeOwnerLaunch.contractAddress
              ? truncateHash(activeOwnerLaunch.contractAddress)
              : "Missing"
          },
          {
            label: "Distribution",
            done: hasDistributedTokens,
            value: hasDistributedTokens ? "Sent" : "Manual"
          },
          {
            label: "Market route",
            done: false,
            value: activePairAddress ? "Pair found" : "Skipped"
          },
          {
            label: "Public listing",
            done: false,
            value: "Not used"
          }
        ]
      : [
          {
            label: "Token",
            done: Boolean(activeOwnerLaunch.contractAddress),
            value: activeOwnerLaunch.contractAddress
              ? truncateHash(activeOwnerLaunch.contractAddress)
              : "Missing"
          },
          {
            label: "Pair",
            done: Boolean(activePairAddress),
            value: activePairAddress ? truncateHash(activePairAddress) : "Needed"
          },
          {
            label: "Liquidity",
            done: hasProvidedLiquidity,
            value: hasProvidedLiquidity ? "Provided" : "Add initial LP"
          },
          {
            label: "LP lock",
            done: hasLockedLp,
            value: hasLockedLp
              ? activeOwnerLaunch.lockExpiry
              : isLpLockerConfigured
              ? "Ready to lock"
              : "Locker env needed"
          },
          {
            label: "Registry",
            done: isLaunchRegistryConfigured,
            value: isLaunchRegistryConfigured ? "Configured" : "Env needed"
          },
          {
            label: "Publish",
            done: isActiveListingPublished,
            value: isActiveListingPublished
              ? activeRegistryStatus === "hidden"
                ? "Hidden"
                : "Live"
              : "Not published"
          }
        ]
    : []
  const activeOwnerNextAction: OwnerNextAction = !activeOwnerLaunch
    ? {
        title: "Create or sync a launch",
        text: "Owner tools unlock after you create a launch or sync published launches for the connected wallet."
      }
    : !activeOwnerLaunch.contractAddress
    ? {
        title: "Token contract missing",
        text: "This local record is incomplete. Remove it from this browser or sync published launches for the connected wallet."
      }
    : activeOwnerIsCw20Only
    ? {
        title: "Distribute the CW20 token",
        text: "CW20 only mode skips pool and listing setup. Use the distribution tool to send tokens to holders manually.",
        actionLabel: "Open distribution",
        targetId: "launchpad-distribution"
      }
    : !activePairAddress
    ? {
        title: `Create the ${nativeSymbol} pair`,
        text: `A token has no launch market until the Terraswap Token / ${nativeSymbol} pair exists.`,
        actionLabel: "Open pair setup",
        targetId: "launchpad-pool"
      }
    : !hasProvidedLiquidity
    ? {
        title: "Add liquidity from market",
        text: "The pair exists, but traders still need funded liquidity before price discovery is meaningful.",
        actionLabel: "Open market",
        actionTo: getLaunchpadMarketPath(activePairAddress)
      }
    : !isLpLockerConfigured
    ? {
        title: "Configure LP locker",
        text: `Set VITE_${chainKey === "luna" ? "LUNA" : "LUNC"}_LAUNCHPAD_LP_LOCKER_ADDRESS and redeploy before creators can lock LP.`,
        actionLabel: "View lock panel",
        targetId: "launchpad-lock"
      }
    : !hasLockedLp
    ? {
        title: "Lock LP tokens",
        text: "Lock the LP token so Explore can show a public unlock date.",
        actionLabel: "Open lock form",
        targetId: "launchpad-lock"
      }
    : !isLaunchRegistryConfigured
    ? {
        title: "Configure registry",
        text: `Set VITE_${chainKey === "luna" ? "LUNA" : "LUNC"}_LAUNCHPAD_REGISTRY_ADDRESS and redeploy before public listing.`,
        actionLabel: "View publish panel",
        targetId: "launchpad-listing"
      }
    : !isActiveListingPublished
    ? {
        title: "Publish the launch",
        text: "All core requirements are ready. Publish metadata to the Burrito registry.",
        actionLabel: "Open publish form",
        targetId: "launchpad-listing"
      }
    : activeRegistryStatus === "hidden"
    ? {
        title: "Listing is hidden",
        text: "Restore it when the creator wants the launch visible in Explore again.",
        actionLabel: "Restore listing",
        targetId: "launchpad-listing"
      }
    : {
        title: "Launch is live",
        text: "Keep project info current, add liquidity when needed, and monitor the LP unlock date.",
        actionLabel: "Manage listing",
        targetId: "launchpad-listing"
      }
  const showOwnerDistributionTool = Boolean(
    activeOwnerLaunch &&
      (activeOwnerIsCw20Only || hasDistributedTokens || isActiveListingPublished)
  )
  useEffect(() => {
    if (!activeOwnerRecordId) return
    if (activeOwnerIsCw20Only) {
      setActiveManageSection("distribution")
      return
    }
    if (activeManageSection === "distribution" && !showOwnerDistributionTool) {
      setActiveManageSection("pool")
    }
  }, [
    activeManageSection,
    activeOwnerIsCw20Only,
    activeOwnerRecordId,
    showOwnerDistributionTool
  ])
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
    setLockLpError(undefined)
    setLockLpTxHash("")
    setLockRegistryError(undefined)
    setLockRegistryTxHash("")
    setLockRegistrySubmitting(false)
    setWithdrawLpError(undefined)
    setWithdrawLpTxHash("")
    setDistributionError(undefined)
    setDistributionTxHash("")
    setDistributionInput("")
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
    setLockLpDays(activeOwnerPlannedLockDays)
  }, [activeOwnerRecordId, activeOwnerPlannedLockDays])

  const handleCreateTerraswapPair = async () => {
    if (!activeOwnerLaunch || !activeTokenAddress) {
      setCreatePairError("Create or sync a launch first.")
      return
    }
    if (activePairAddress) {
      setCreatePairError(
        `This token already has a Terraswap ${nativeSymbol} pair.`
      )
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
      startTx(`Create ${activeOwnerLaunch.symbol} / ${nativeSymbol} pair`)
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
        `Burrito create ${nativeSymbol} pair`
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
                  pair: `${record.symbol} / ${nativeSymbol}`,
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
      const message = formatTxError(error, "Create pair failed.")
      setCreatePairError(message)
      failTx(message)
    } finally {
      setCreatePairSubmitting(false)
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
        `LP locker contract is not configured. Add VITE_${chainKey === "luna" ? "LUNA" : "LUNC"}_LAUNCHPAD_LP_LOCKER_ADDRESS after deploying the locker.`
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

      startTx(`Lock ${activeOwnerLaunch.symbol} / ${nativeSymbol} LP`)
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
                ownerStatus:
                  record.registryTxHash || record.registryLaunchId
                    ? "LP locked, update public lock"
                    : "LP locked",
                lpLockId: lockId,
                lpLockTxHash: result.transactionHash,
                lpUnlockAt: unlockDate
              }
            : record
        )
      )
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Lock LP failed.")
      setLockLpError(message)
      failTx(message)
    } finally {
      setLockLpSubmitting(false)
    }
  }

  const handleUpdateRegistryLock = async () => {
    if (!activeOwnerLaunch?.contractAddress || !activeOwnerLaunch.lpLockId) {
      setLockRegistryError("No public lock data is available for this launch.")
      return
    }
    if (!isActiveListingPublished) {
      setLockRegistryError("Publish this launch before updating public lock data.")
      return
    }
    if (!isLaunchRegistryConfigured) {
      setLockRegistryError("Launch registry contract is not configured.")
      return
    }
    if (!activeLpLockUpdateTime || activeLpLockUpdateTime <= Math.floor(Date.now() / 1000)) {
      setLockRegistryError("The selected LP lock must still be active.")
      return
    }
    if (!connectorId || !account?.address) {
      setLockRegistryError("Connect a wallet first.")
      return
    }

    try {
      setLockRegistrySubmitting(true)
      setLockRegistryError(undefined)
      setLockRegistryTxHash("")
      startTx(`Update ${activeOwnerLaunch.symbol} public LP lock`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const result = await client.signAndBroadcast(
        signerAddress,
        [
          buildUpdateLaunchMessage({
            sender: signerAddress,
            tokenContract: activeOwnerLaunch.contractAddress,
            lpLockId: activeOwnerLaunch.lpLockId,
            lpUnlockTime: activeLpLockUpdateTime
          })
        ],
        "auto",
        "Burrito update launch LP lock"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Update public LP lock failed")
      }

      setLockRegistryTxHash(result.transactionHash)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                ownerStatus: "Public LP lock updated",
                lpLockUpdateTxHash: result.transactionHash
              }
            : record
        )
      )
      await refreshRegistryLaunches()
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Update public LP lock failed.")
      setLockRegistryError(message)
      failTx(message)
    } finally {
      setLockRegistrySubmitting(false)
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
      startTx(`Withdraw ${activeOwnerLaunch.symbol} / ${nativeSymbol} LP`)
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
      const message = formatTxError(error, "Withdraw locked LP failed.")
      setWithdrawLpError(message)
      failTx(message)
    } finally {
      setWithdrawLpSubmitting(false)
    }
  }

  const handleDistributeTokens = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOwnerLaunch?.contractAddress) {
      setDistributionError("Create or sync a launch first.")
      return
    }
    if (!connectorId || !account?.address) {
      setDistributionError("Connect a wallet first.")
      return
    }
    if (distributionPreview.error) {
      setDistributionError(distributionPreview.error)
      return
    }
    if (!distributionPreview.transfers.length) {
      setDistributionError("Add at least one recipient and amount.")
      return
    }

    try {
      setDistributionSubmitting(true)
      setDistributionError(undefined)
      setDistributionTxHash("")
      startTx(`Distribute ${activeOwnerLaunch.symbol}`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const messages = distributionPreview.transfers.map((transfer) =>
        buildCw20TransferMessage({
          sender: signerAddress,
          tokenAddress: activeOwnerLaunch.contractAddress ?? "",
          recipient: transfer.recipient,
          amount: transfer.amount
        })
      )
      const result = await client.signAndBroadcast(
        signerAddress,
        messages,
        "auto",
        `Burrito distribute ${activeOwnerLaunch.symbol}`
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Distribute tokens failed")
      }

      setDistributionTxHash(result.transactionHash)
      setCreatedLaunches((current) =>
        current.map((record) =>
          record.id === activeOwnerLaunch.id
            ? {
                ...record,
                ownerStatus: "Tokens distributed",
                distributionTxHash: result.transactionHash
              }
            : record
        )
      )
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Distribute tokens failed.")
      setDistributionError(message)
      failTx(message)
    } finally {
      setDistributionSubmitting(false)
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
      setPublishError("Create or sync a launch first.")
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
      const normalizedWebsite = normalizeOptionalHttpUrl(
        publishWebsite,
        "Website"
      )
      const normalizedXProfile = normalizeOptionalXProfile(publishXProfile)
      const normalizedDescription = publishDescription.trim()

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
                  website: normalizedWebsite,
                  xProfile: normalizedXProfile,
                  description: normalizedDescription
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
                  website: normalizedWebsite,
                  xProfile: normalizedXProfile,
                  description: normalizedDescription
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
                website: normalizedWebsite,
                xProfile: normalizedXProfile,
                description: normalizedDescription,
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
      const message = formatTxError(error, "Publish listing failed.")
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
      const message = formatTxError(error, "Update listing visibility failed.")
      setListingStatusError(message)
      failTx(message)
    } finally {
      setListingStatusSubmitting(null)
    }
  }

  return (
    <PageShell
      title="Launchpad"
      extra={<span className={styles.phasePill}>V1</span>}
    >
      <LaunchpadTabs activeTab={activeTab} onSelectTab={handleSelectTab} />

      {activeTab === "create" ? (
        <section className={styles.createGrid}>
          <LaunchCreateForm
            activeCreateStep={activeCreateStep}
            activeStepIsLast={activeStepIsLast}
            activeStepStatus={activeStepStatus}
            createStepStatus={createStepStatus}
            createSubmitting={createSubmitting}
            draft={draft}
            isCw20Only={isCw20Only}
            launchLockDaysError={launchLockDaysError}
            riskAcknowledged={riskAcknowledged}
            riskConfirmationText={riskConfirmationText}
            symbolError={symbolError}
            onCreateFullLaunch={() => handleCreateTokenContract("full-launch")}
            onDraftFieldChange={updateDraft}
            onResetDraft={resetDraft}
            onRiskAcknowledgedChange={setRiskAcknowledged}
            onSetActiveCreateStep={setActiveCreateStep}
            onSetDraft={setDraft}
          />

          <LaunchCreatePreview
            tokenSymbol={tokenSymbol}
            logoUrl={draft.logoUrl}
            isCw20Only={isCw20Only}
            startPriceLunc={launchMath.startPriceLunc}
            tokenForPool={launchMath.tokenForPool}
            startingMcapLunc={launchMath.startingMcapLunc}
            lockDays={draft.lockDays}
            readinessPercent={readiness.percent}
            createError={createError}
            createdToken={createdToken}
          />
        </section>
      ) : null}

      {activeTab === "explore" ? (
        <LaunchExplorePanel
          activeLaunchFilter={activeLaunchFilter}
          copiedValue={copiedValue}
          copyError={copyError}
          exploreEmptyText={exploreEmptyText}
          filteredLaunches={filteredLaunches}
          isLaunchRegistryConfigured={isLaunchRegistryConfigured}
          launchSearch={launchSearch}
          launchSort={launchSort}
          registryError={registryError}
          registryLoading={registryLoading}
          selectedLaunch={selectedLaunch}
          onCopyText={handleCopyText}
          onFilterChange={setActiveLaunchFilter}
          onSearchChange={setLaunchSearch}
          onSelectLaunch={handleSelectLaunch}
          onSortChange={setLaunchSort}
        />
      ) : null}

      {activeTab === "manage" ? (
        <section className={styles.manageGrid}>
          <LaunchManageOverview
            activeManageSection={activeManageSection}
            activeOwnerIsCw20Only={activeOwnerIsCw20Only}
            activeOwnerLaunch={activeOwnerLaunch}
            activeOwnerNextAction={activeOwnerNextAction}
            activeOwnerReadiness={activeOwnerReadiness}
            activePairAddress={activePairAddress}
            accountAddress={account?.address}
            copiedValue={copiedValue}
            copyError={copyError}
            isActiveOwnerLocalRecord={isActiveOwnerLocalRecord}
            isLaunchRegistryConfigured={isLaunchRegistryConfigured}
            hiddenLocalRecordCount={hiddenLocalRecordCount}
            localRecordNotice={localRecordNotice}
            ownerRecords={ownerRecords}
            showOwnerDistributionTool={showOwnerDistributionTool}
            syncError={syncError}
            syncResult={syncResult}
            syncSubmitting={syncSubmitting}
            onCopyText={handleCopyText}
            onRemoveLocalRecord={handleRemoveLocalRecord}
            onScrollToManageSection={scrollToManageSection}
            onSelectOwnerId={setActiveOwnerId}
            onSetManageSection={setActiveManageSection}
            onSyncOwnerLaunches={handleSyncOwnerLaunches}
          />

          {activeOwnerLaunch &&
          showOwnerDistributionTool &&
          activeManageSection === "distribution" ? (
            <LaunchDistributionTool
              activeOwnerIsCw20Only={activeOwnerIsCw20Only}
              activeOwnerLaunch={activeOwnerLaunch}
              activeTokenDecimals={activeTokenDecimals}
              canDistributeTokens={canDistributeTokens}
              distributionError={distributionError}
              distributionInput={distributionInput}
              distributionPreview={distributionPreview}
              distributionSubmitting={distributionSubmitting}
              distributionTxHash={distributionTxHash}
              walletReady={Boolean(connectorId && account?.address)}
              onDistributionInputChange={setDistributionInput}
              onSubmit={handleDistributeTokens}
            />
          ) : null}

          {activeOwnerLaunch &&
          !activeOwnerIsCw20Only &&
          activeManageSection === "pool" ? (
            <article id="launchpad-pool" className={`card ${styles.poolSetup}`}>
              <div className={styles.planHeader}>
                <span>Step 1</span>
                <h3>{nativeSymbol} pair</h3>
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
                      href={getAddressExplorerUrl(chainKey, activePairAddress)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Pair contract</span>
                      <strong>{truncateHash(activePairAddress)}</strong>
                    </a>
                  ) : null}
                  {activeLiquidityToken ? (
                    <a
                      href={getAddressExplorerUrl(
                        chainKey,
                        activeLiquidityToken
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>LP token</span>
                      <strong>{truncateHash(activeLiquidityToken)}</strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.pairTxHash || createPairTxHash ? (
                    <a
                      href={getTxExplorerUrl(
                        chainKey,
                        activeOwnerLaunch.pairTxHash || createPairTxHash
                      )}
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
                  {activeOwnerLaunch.liquidityTxHash ? (
                    <a
                      href={getTxExplorerUrl(
                        chainKey,
                        activeOwnerLaunch.liquidityTxHash
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Liquidity tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.liquidityTxHash)}
                      </strong>
                    </a>
                  ) : null}
                  {activeOwnerLaunch.liquidityWithdrawTxHash ? (
                    <a
                      href={getTxExplorerUrl(
                        chainKey,
                        activeOwnerLaunch.liquidityWithdrawTxHash
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Remove LP tx</span>
                      <strong>
                        {truncateHash(activeOwnerLaunch.liquidityWithdrawTxHash)}
                      </strong>
                    </a>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.noticeBox}>
                Create the pair here, then open the market page to add or
                remove liquidity for this pool.
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
                      href={getTxExplorerUrl(chainKey, createPairTxHash)}
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
                  : `Create ${nativeSymbol} pair`}
              </button>

              {activePairAddress ? (
                <Link
                  className="uiButton uiButtonPrimary"
                  to={getLaunchpadMarketPath(activePairAddress)}
                >
                  Open market liquidity
                </Link>
              ) : null}
            </article>
          ) : null}

          {activeOwnerLaunch &&
          !activeOwnerIsCw20Only &&
          activeManageSection === "lock" ? (
            <article id="launchpad-lock" className={`card ${styles.lockSetup}`}>
              <div className={styles.planHeader}>
                <span>Step 2</span>
                <h3>Lock LP</h3>
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
                  Provide liquidity first. Then lock the LP token here.
                </div>
              ) : !isLpLockerConfigured ? (
                <div className={styles.noticeBox}>
                  LP lock is wired but disabled until the locker contract is
                  deployed and the chain-specific LP locker address is configured.
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
                      This sends LP CW20 tokens to the locker until unlock time.
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
                            href={getTxExplorerUrl(chainKey, lockLpTxHash)}
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
                          <span>Unlock</span>
                          <strong>{activeOwnerLaunch.lockExpiry}</strong>
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
                      {isActiveListingPublished ? (
                        <div className={styles.noticeBox}>
                          If this is a new or extended LP lock, update the
                          public Launchpad listing so traders see the current
                          lock id and unlock date.
                        </div>
                      ) : null}
                      {lockRegistryError ? (
                        <div className={styles.txError}>{lockRegistryError}</div>
                      ) : null}
                      {lockRegistryTxHash ||
                      activeOwnerLaunch.lpLockUpdateTxHash ? (
                        <div className={styles.txResult}>
                          <div>
                            <span>Public lock tx</span>
                            <a
                              href={getTxExplorerUrl(
                                chainKey,
                                lockRegistryTxHash ||
                                  activeOwnerLaunch.lpLockUpdateTxHash ||
                                  ""
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {truncateHash(
                                lockRegistryTxHash ||
                                  activeOwnerLaunch.lpLockUpdateTxHash ||
                                  ""
                              )}
                            </a>
                          </div>
                        </div>
                      ) : null}
                      {isActiveListingPublished ? (
                        <button
                          className="uiButton uiButtonPrimary"
                          type="button"
                          disabled={!canUpdateRegistryLock}
                          onClick={handleUpdateRegistryLock}
                        >
                          {lockRegistrySubmitting
                            ? "Broadcasting..."
                            : !connectorId || !account?.address
                            ? "Connect wallet first"
                            : "Update public LP lock"}
                        </button>
                      ) : null}
                      {withdrawLpError ? (
                        <div className={styles.txError}>{withdrawLpError}</div>
                      ) : null}
                      {withdrawLpTxHash ? (
                        <div className={styles.txResult}>
                          <div>
                            <span>Withdraw tx</span>
                            <a
                              href={getTxExplorerUrl(
                                chainKey,
                                withdrawLpTxHash
                              )}
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

          {activeOwnerLaunch &&
          !activeOwnerIsCw20Only &&
          activeManageSection === "listing" ? (
            <article id="launchpad-listing" className={`card ${styles.listingSetup}`}>
              <div className={styles.planHeader}>
                <span>Step 3</span>
                <h3>Publish</h3>
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
                  contract is deployed and the chain-specific registry address is
                  configured.
                </div>
              ) : !hasPublicListingPrerequisites && !isActiveListingPublished ? (
                <div className={styles.noticeBox}>
                  Publish after pair, liquidity, and LP lock are complete.
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
                          href={getTxExplorerUrl(chainKey, publishTxHash)}
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
                              href={getTxExplorerUrl(
                                chainKey,
                                listingStatusTxHash
                              )}
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

        </section>
      ) : null}

    </PageShell>
  )
}

export default Launchpad
