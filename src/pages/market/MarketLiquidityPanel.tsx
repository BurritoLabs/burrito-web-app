import { useCallback, useMemo, useState, type FormEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CLASSIC_DENOMS } from "../../app/chain"
import {
  DEFAULT_SLIPPAGE_BPS,
  SLIPPAGE_OPTIONS
} from "../../app/config/swapConfig"
import { fetchBalances, queryContractSmart } from "../../app/data/classic"
import { fetchCw20Balance } from "../../app/data/cw20"
import {
  formatBaseUnitsToTokenAmount,
  parseTokenAmountToBaseUnits
} from "../../app/launchpad/cw20"
import {
  buildIncreaseAllowanceMessage,
  buildProvideGarudaLiquidityMessage,
  buildProvideStandardLiquidityMessage,
  buildWithdrawGarudaLiquidityMessage,
  buildWithdrawTerraswapLiquidityMessage,
  fetchTerraswapPairInfo
} from "../../app/launchpad/pool"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates
} from "../../app/utils/assetIcons"
import { formatTxError } from "../../app/utils/txError"
import { truncateHash } from "../../app/utils/format"
import { getTxExplorerUrl } from "../../app/explorer"
import { useAppChain } from "../../app/appChainContext"
import { useWallet } from "../../app/wallet/WalletContext"
import {
  connectClassicSigningClientForConnector,
  getSignerAddressForConnector
} from "../../app/wallet/walletAdapters"
import SwapAssetIcon from "../components/swap/SwapAssetIcon"
import styles from "../MarketPairDetails.module.css"

type MarketLiquidityPanelProps = {
  assets?: MarketLiquidityAsset[]
  dexId: string
  dexLabel: string
  mode?: LiquidityMode
  pairAddress: string
  poolAssets?: Array<{ id: string; amount: string }>
  tokenAddress?: string
  tokenDecimals?: number
  tokenIconCandidates?: string[]
  tokenSymbol?: string
}

type MarketLiquidityAsset = {
  decimals: number
  iconCandidates?: string[]
  id: string
  name?: string
  symbol: string
}

type ParsedLiquidityAsset = MarketLiquidityAsset & (
  | {
      contract: string
      type: "cw20"
    }
  | {
      denom: string
      type: "native"
    }
)

type Cw20BalanceResponse = {
  balance?: string
}

type Cw20TokenInfo = {
  decimals?: number
}

type TerraswapPoolAsset = {
  info?: {
    native_token?: {
      denom?: string
    }
    token?: {
      contract_addr?: string
    }
  }
  amount?: string
}

type TerraswapPoolResponse = {
  assets?: TerraswapPoolAsset[]
  total_share?: string
}

type GarudaPoolAssetInfo = {
  cw20?: string
  native?: string
}

type GarudaPoolResponse = {
  asset1?: GarudaPoolAssetInfo
  asset2?: GarudaPoolAssetInfo
  liquidity_token?: string
  reserve1?: string
  reserve2?: string
  total_supply?: string
}

type LiquidityProtocol = "standard" | "garuda" | "weso-defi"
type LiquidityMode = "provide" | "withdraw"

const EMPTY_ICON_CANDIDATES: string[] = []
const STANDARD_LIQUIDITY_DEX_IDS = new Set([
  "terraswap",
  "terraswap-legacy",
  "astroport",
  "phoenix",
  "terraport-v2",
  "terraport-cpmm",
  "terraport-v3"
])
const GARUDA_LIQUIDITY_DEX_IDS = new Set(["garuda-v1", "garuda-v2"])
const WESO_DEFI_LIQUIDITY_DEX_IDS = new Set(["weso-defi"])

const normalizeAddress = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? ""

const parseLiquidityAsset = (
  asset: MarketLiquidityAsset | undefined
): ParsedLiquidityAsset | undefined => {
  if (!asset?.id) return undefined
  if (asset.id.startsWith("cw20:")) {
    const contract = asset.id.slice("cw20:".length).toLowerCase()
    if (!contract) return undefined
    return {
      ...asset,
      contract,
      id: `cw20:${contract}`,
      type: "cw20"
    }
  }
  if (asset.id.startsWith("native:")) {
    const denom = asset.id.slice("native:".length)
    if (!denom) return undefined
    return {
      ...asset,
      denom,
      id: `native:${denom}`,
      type: "native"
    }
  }
  return undefined
}

const resolveAssetIdFromInfo = (info?: TerraswapPoolAsset["info"]) => {
  const contract = info?.token?.contract_addr?.toLowerCase()
  if (contract) return `cw20:${contract}`
  const denom = info?.native_token?.denom
  if (denom) return `native:${denom}`
  return ""
}

const resolveAssetIdFromGarudaInfo = (info?: GarudaPoolAssetInfo) => {
  const contract = info?.cw20?.toLowerCase()
  if (contract) return `cw20:${contract}`
  const denom = info?.native
  if (denom) return `native:${denom}`
  return ""
}

const toStandardAssetInfo = (asset: ParsedLiquidityAsset) =>
  asset.type === "native"
    ? {
        native_token: {
          denom: asset.denom
        }
      }
    : {
        token: {
          contract_addr: asset.contract
        }
      }

const toGarudaAssetInfo = (asset: ParsedLiquidityAsset) =>
  asset.type === "native"
    ? {
        native: asset.denom
      }
    : {
        cw20: asset.contract
      }

const buildAssetIconCandidates = (asset: ParsedLiquidityAsset | undefined) => {
  if (!asset) return EMPTY_ICON_CANDIDATES
  if (asset.iconCandidates?.length) return asset.iconCandidates
  if (asset.type === "native") {
    return buildClassicNativeIconCandidates({
      denom: asset.denom,
      symbol: asset.symbol
    })
  }
  return buildCw20IconCandidates(undefined, asset.symbol)
}

const formatBalance = (amount: string | undefined, decimals: number) =>
  amount ? formatBaseUnitsToTokenAmount(amount, decimals, 6) : "--"

const isValidDecimals = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 18

const formatRatio = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(value)

const toInputAmount = (amount: string, decimals: number) =>
  formatBaseUnitsToTokenAmount(amount, decimals, decimals).replace(/,/g, "")

const divideBaseUnits = (amount: bigint, numerator: bigint, denominator: bigint) => {
  if (denominator <= 0n) return "0"
  return ((amount * numerator) / denominator).toString()
}

const pow10 = (decimals: number) =>
  10n ** BigInt(Math.max(0, Math.trunc(decimals)))

const minBigInt = (first: bigint, second: bigint) =>
  first < second ? first : second

const bpsToSlippageTolerance = (bps: bigint) => {
  const normalized = Number(bps) / 10_000
  return normalized.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0.005"
}

const applySlippageBps = (amount: string | undefined, bps: bigint) => {
  if (!amount || !/^\d+$/.test(amount)) return "0"
  const base = BigInt(amount)
  if (base <= 0n) return "0"
  const multiplier = 10_000n - bps
  if (multiplier <= 0n) return "0"
  return ((base * multiplier) / 10_000n).toString()
}

const formatAmountPerLp = (
  assetBase: bigint,
  lpBase: bigint,
  assetDecimals: number,
  lpDecimals: number
) => {
  if (assetBase <= 0n || lpBase <= 0n) return "--"
  const perLpBase = (assetBase * pow10(lpDecimals)) / lpBase
  return formatBaseUnitsToTokenAmount(perLpBase.toString(), assetDecimals, 6)
}

const formatPercentFromRatio = (part: bigint, total: bigint) => {
  if (part <= 0n || total <= 0n) return "--"
  const scaled = (part * 1_000_000n) / total
  if (scaled === 0n) return "<0.0001%"
  const whole = scaled / 10_000n
  const fraction = (scaled % 10_000n).toString().padStart(4, "0").replace(/0+$/, "")
  return `${whole.toString()}${fraction ? `.${fraction}` : ""}%`
}

const MarketLiquidityPanel = ({
  assets = [],
  dexId,
  dexLabel,
  mode = "provide",
  pairAddress,
  poolAssets = [],
  tokenAddress,
  tokenDecimals: fallbackTokenDecimals = 6,
  tokenIconCandidates = EMPTY_ICON_CANDIDATES,
  tokenSymbol: fallbackTokenSymbol = "TOKEN"
}: MarketLiquidityPanelProps) => {
  const { chain, chainKey } = useAppChain()
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const queryClient = useQueryClient()
  const [tokenAmount, setTokenAmount] = useState("")
  const [luncAmount, setLuncAmount] = useState("")
  const [lpAmount, setLpAmount] = useState("")
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS)
  const [provideDetailsOpen, setProvideDetailsOpen] = useState(false)
  const [provideSubmitting, setProvideSubmitting] = useState(false)
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)
  const [provideError, setProvideError] = useState<string>()
  const [withdrawError, setWithdrawError] = useState<string>()
  const [provideTxHash, setProvideTxHash] = useState("")
  const [withdrawTxHash, setWithdrawTxHash] = useState("")

  const normalizedDexId = dexId.toLowerCase()
  const normalizedTokenAddress = normalizeAddress(tokenAddress)
  const normalizedPairAddress = normalizeAddress(pairAddress)
  const accountAddress = account?.address ?? ""
  const fallbackAssets = useMemo(
    () =>
      normalizedTokenAddress
        ? [
            {
              decimals: fallbackTokenDecimals,
              iconCandidates: tokenIconCandidates,
              id: `cw20:${normalizedTokenAddress}`,
              symbol: fallbackTokenSymbol
            },
            {
              decimals: CLASSIC_DENOMS.lunc.coinDecimals,
              iconCandidates: buildClassicNativeIconCandidates({
                denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                symbol: CLASSIC_DENOMS.lunc.coinDenom
              }),
              id: `native:${CLASSIC_DENOMS.lunc.coinMinimalDenom}`,
              symbol: CLASSIC_DENOMS.lunc.coinDenom
            }
          ]
        : [],
    [
      fallbackTokenDecimals,
      fallbackTokenSymbol,
      normalizedTokenAddress,
      tokenIconCandidates
    ]
  )
  const liquidityAssets = useMemo(
    () =>
      (assets.length >= 2 ? assets : fallbackAssets)
        .slice(0, 2)
        .map(parseLiquidityAsset),
    [assets, fallbackAssets]
  )
  const tokenAsset = liquidityAssets[0]
  const luncAsset = liquidityAssets[1]
  const tokenSymbol = tokenAsset?.symbol ?? fallbackTokenSymbol
  const luncSymbol = luncAsset?.symbol ?? CLASSIC_DENOMS.lunc.coinDenom
  const tokenDisplayIconCandidates = useMemo(
    () => buildAssetIconCandidates(tokenAsset),
    [tokenAsset]
  )
  const luncIconCandidates = useMemo(
    () => buildAssetIconCandidates(luncAsset),
    [luncAsset]
  )
  const liquidityProtocol: LiquidityProtocol | undefined =
    STANDARD_LIQUIDITY_DEX_IDS.has(normalizedDexId)
      ? "standard"
      : GARUDA_LIQUIDITY_DEX_IDS.has(normalizedDexId)
      ? "garuda"
      : WESO_DEFI_LIQUIDITY_DEX_IDS.has(normalizedDexId)
      ? "weso-defi"
      : undefined
  const supportsWesoLiquidity = liquidityProtocol === "weso-defi"
  const supportsStandardLiquidity =
    liquidityProtocol === "standard" || supportsWesoLiquidity
  const supportsGarudaLiquidity = liquidityProtocol === "garuda"
  const hasLiquidityAssets = Boolean(tokenAsset && luncAsset)
  const isProvideMode = mode === "provide"
  const modeHint = isProvideMode
    ? "Add liquidity to this pool."
    : "Remove liquidity from this pool."
  const supported = Boolean(
    liquidityProtocol &&
      normalizedPairAddress &&
      hasLiquidityAssets
  )

  const { data: pairInfo, isLoading: pairInfoLoading } = useQuery({
    queryKey: [
      "market",
      "liquidity",
      "pair-info",
      chain.chainId,
      normalizedDexId,
      normalizedPairAddress
    ],
    queryFn: () => fetchTerraswapPairInfo(normalizedPairAddress),
    enabled: supportsStandardLiquidity && supported,
    staleTime: 60_000
  })

  const resolvedPairAddress =
    supportsStandardLiquidity
      ? pairInfo?.contract_addr?.toLowerCase() ?? normalizedPairAddress
      : normalizedPairAddress
  const unsupportedPairType =
    supportsStandardLiquidity && Boolean(pairInfo?.pair_type?.custom)
  const baseLiquidityAvailable = supported && !unsupportedPairType
  const pairAssetDecimals = useMemo(() => {
    const map = new Map<string, number>()
    pairInfo?.asset_infos?.forEach((info, index) => {
      const id = resolveAssetIdFromInfo(info)
      const decimals = pairInfo.asset_decimals?.[index]
      if (id && isValidDecimals(decimals)) {
        map.set(id, decimals)
      }
    })
    return map
  }, [pairInfo])
  const tokenDecimals =
    pairAssetDecimals.get(tokenAsset?.id ?? "") ??
    tokenAsset?.decimals ??
    fallbackTokenDecimals
  const luncDecimals =
    pairAssetDecimals.get(luncAsset?.id ?? "") ??
    luncAsset?.decimals ??
    CLASSIC_DENOMS.lunc.coinDecimals

  const { data: livePoolInfo, refetch: refetchPoolInfo } = useQuery({
    queryKey: [
      "market",
      "liquidity",
      "pool",
      chain.chainId,
      resolvedPairAddress
    ],
    queryFn: () =>
      queryContractSmart<TerraswapPoolResponse | GarudaPoolResponse>(
        resolvedPairAddress,
        {
          pool: {}
        }
      ),
    enabled: baseLiquidityAvailable && Boolean(resolvedPairAddress),
    staleTime: 45_000,
    refetchInterval: 90_000
  })

  const garudaPoolInfo = supportsGarudaLiquidity
    ? (livePoolInfo as GarudaPoolResponse | undefined)
    : undefined
  const lpTokenAddress =
    pairInfo?.liquidity_token?.toLowerCase() ??
    garudaPoolInfo?.liquidity_token?.toLowerCase() ??
    ""
  const lpTokenMatchesPoolAsset = Boolean(
    lpTokenAddress &&
      [tokenAsset, luncAsset].some(
        (asset) => asset?.type === "cw20" && asset.contract === lpTokenAddress
      )
  )
  const unsupportedWesoPool =
    supportsWesoLiquidity &&
    (!lpTokenAddress ||
      lpTokenAddress === resolvedPairAddress ||
      lpTokenMatchesPoolAsset)
  const liquidityInfoLoading = supportsWesoLiquidity && pairInfoLoading
  const liquidityEnabled =
    baseLiquidityAvailable &&
    !liquidityInfoLoading &&
    !unsupportedWesoPool

  const { data: lpTokenInfo } = useQuery({
    queryKey: [
      "market",
      "liquidity",
      chain.chainId,
      "lp-token-info",
      lpTokenAddress
    ],
    queryFn: () =>
      queryContractSmart<Cw20TokenInfo>(lpTokenAddress, { token_info: {} }),
    enabled: Boolean(lpTokenAddress),
    staleTime: 5 * 60_000
  })

  const lpDecimals =
    typeof lpTokenInfo?.decimals === "number" ? lpTokenInfo.decimals : 6

  const poolReserves = useMemo(() => {
    const fromLivePool = new Map<string, string>()
    const standardPool = livePoolInfo as TerraswapPoolResponse | undefined
    standardPool?.assets?.forEach((asset) => {
      const id = resolveAssetIdFromInfo(asset.info)
      if (id) fromLivePool.set(id, asset.amount ?? "0")
    })

    const garudaPool = livePoolInfo as GarudaPoolResponse | undefined
    const garudaAsset1Id = resolveAssetIdFromGarudaInfo(garudaPool?.asset1)
    const garudaAsset2Id = resolveAssetIdFromGarudaInfo(garudaPool?.asset2)
    if (garudaAsset1Id) {
      fromLivePool.set(garudaAsset1Id, garudaPool?.reserve1 ?? "0")
    }
    if (garudaAsset2Id) {
      fromLivePool.set(garudaAsset2Id, garudaPool?.reserve2 ?? "0")
    }

    const fromMarketIndex = new Map<string, string>()
    poolAssets.forEach((asset) => {
      fromMarketIndex.set(asset.id, asset.amount)
    })

    const tokenId = tokenAsset?.id ?? ""
    const luncId = luncAsset?.id ?? ""

    return {
      token: fromLivePool.get(tokenId) || fromMarketIndex.get(tokenId) || "",
      lunc: fromLivePool.get(luncId) || fromMarketIndex.get(luncId) || "",
      totalShare: standardPool?.total_share ?? garudaPool?.total_supply ?? ""
    }
  }, [livePoolInfo, luncAsset?.id, poolAssets, tokenAsset?.id])

  const garudaAssetOrder = useMemo(() => {
    if (!supportsGarudaLiquidity) return undefined
    const garudaPool = livePoolInfo as GarudaPoolResponse | undefined
    const asset1Id = resolveAssetIdFromGarudaInfo(garudaPool?.asset1)
    const asset2Id = resolveAssetIdFromGarudaInfo(garudaPool?.asset2)
    return asset1Id && asset2Id ? ([asset1Id, asset2Id] as const) : undefined
  }, [livePoolInfo, supportsGarudaLiquidity])

  const poolRatio = useMemo(() => {
    if (!/^\d+$/.test(poolReserves.token) || !/^\d+$/.test(poolReserves.lunc)) {
      return undefined
    }

    const tokenReserve = BigInt(poolReserves.token)
    const luncReserve = BigInt(poolReserves.lunc)
    if (tokenReserve <= 0n || luncReserve <= 0n) return undefined

    const luncPerToken = Number(luncReserve) / Number(tokenReserve)
    const tokenPerLunc = Number(tokenReserve) / Number(luncReserve)
    if (!Number.isFinite(luncPerToken) || !Number.isFinite(tokenPerLunc)) {
      return undefined
    }

    return {
      tokenReserve,
      luncReserve,
      luncPerToken,
      tokenPerLunc
    }
  }, [poolReserves.lunc, poolReserves.token])

  const currentLpPrice = useMemo(() => {
    if (!poolRatio || !/^\d+$/.test(poolReserves.totalShare)) {
      return undefined
    }

    const totalShare = BigInt(poolReserves.totalShare)
    if (totalShare <= 0n) return undefined

    return {
      tokenPerLp: formatAmountPerLp(
        poolRatio.tokenReserve,
        totalShare,
        tokenDecimals,
        lpDecimals
      ),
      luncPerLp: formatAmountPerLp(
        poolRatio.luncReserve,
        totalShare,
        luncDecimals,
        lpDecimals
      )
    }
  }, [lpDecimals, luncDecimals, poolRatio, poolReserves.totalShare, tokenDecimals])

  const { data: nativeBalances = {}, refetch: refetchNativeBalances } = useQuery({
    queryKey: [
      "market",
      "liquidity",
      chain.chainId,
      "native-balances",
      accountAddress
    ],
    queryFn: async () => {
      const balances = await fetchBalances(accountAddress)
      return Object.fromEntries(
        balances.map((balance) => [balance.denom, balance.amount])
      ) as Record<string, string>
    },
    enabled: Boolean(accountAddress),
    staleTime: 30_000
  })

  const cw20BalanceContracts = useMemo(
    () =>
      Array.from(
        new Set(
          [tokenAsset, luncAsset]
            .filter((asset): asset is ParsedLiquidityAsset => Boolean(asset))
            .filter((asset) => asset.type === "cw20")
            .map((asset) => (asset.type === "cw20" ? asset.contract : ""))
            .filter(Boolean)
        )
      ),
    [luncAsset, tokenAsset]
  )

  const { data: cw20Balances = {}, refetch: refetchCw20Balances } = useQuery({
    queryKey: [
      "market",
      "liquidity",
      chain.chainId,
      "cw20-balances",
      accountAddress,
      cw20BalanceContracts.join(",")
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        cw20BalanceContracts.map(async (contract) => [
          contract,
          await fetchCw20Balance(accountAddress, contract)
        ])
      )
      return Object.fromEntries(entries) as Record<string, string>
    },
    enabled: Boolean(accountAddress && cw20BalanceContracts.length),
    staleTime: 30_000
  })

  const getAssetBalance = useCallback(
    (asset: ParsedLiquidityAsset | undefined) => {
      if (!asset) return "0"
      return asset.type === "native"
        ? nativeBalances[asset.denom] ?? "0"
        : cw20Balances[asset.contract] ?? "0"
    },
    [cw20Balances, nativeBalances]
  )

  const tokenBalance = getAssetBalance(tokenAsset)
  const luncBalance = getAssetBalance(luncAsset)

  const { data: lpBalance = "0", refetch: refetchLpBalance } = useQuery({
    queryKey: [
      "market",
      "liquidity",
      chain.chainId,
      "lp-balance",
      accountAddress,
      lpTokenAddress
    ],
    queryFn: async () => {
      const result = await queryContractSmart<Cw20BalanceResponse>(
        lpTokenAddress,
        { balance: { address: accountAddress } }
      )
      return result.balance ?? "0"
    },
    enabled: Boolean(accountAddress && lpTokenAddress),
    staleTime: 30_000
  })

  const tokenBalanceInput = useMemo(
    () =>
      tokenBalance !== "0"
        ? toInputAmount(tokenBalance, tokenDecimals)
        : "",
    [tokenBalance, tokenDecimals]
  )

  const luncBalanceInput = useMemo(
    () =>
      luncBalance !== "0"
        ? toInputAmount(luncBalance, luncDecimals)
        : "",
    [luncBalance, luncDecimals]
  )

  const lpBalanceInput = useMemo(
    () =>
      lpBalance !== "0"
        ? toInputAmount(lpBalance, lpDecimals)
        : "",
    [lpBalance, lpDecimals]
  )

  const estimateLuncFromToken = useCallback(
    (value: string) => {
      if (!poolRatio) return ""
      try {
        const tokenBase = BigInt(
          parseTokenAmountToBaseUnits(value, tokenDecimals, `${tokenSymbol} amount`)
        )
        return toInputAmount(
          divideBaseUnits(tokenBase, poolRatio.luncReserve, poolRatio.tokenReserve),
          luncDecimals
        )
      } catch {
        return ""
      }
    },
    [luncDecimals, poolRatio, tokenDecimals, tokenSymbol]
  )

  const estimateTokenFromLunc = useCallback(
    (value: string) => {
      if (!poolRatio) return ""
      try {
        const luncBase = BigInt(
          parseTokenAmountToBaseUnits(value, luncDecimals, `${luncSymbol} amount`)
        )
        return toInputAmount(
          divideBaseUnits(luncBase, poolRatio.tokenReserve, poolRatio.luncReserve),
          tokenDecimals
        )
      } catch {
        return ""
      }
    },
    [luncDecimals, luncSymbol, poolRatio, tokenDecimals]
  )

  const setBalancedMax = useCallback(() => {
    if (!poolRatio || !/^\d+$/.test(tokenBalance) || !/^\d+$/.test(luncBalance)) {
      if (tokenBalanceInput) setTokenAmount(tokenBalanceInput)
      return
    }

    const tokenBalanceBase = BigInt(tokenBalance)
    const luncBalanceBase = BigInt(luncBalance)
    const tokenLimitFromLunc = BigInt(
      divideBaseUnits(
        luncBalanceBase,
        poolRatio.tokenReserve,
        poolRatio.luncReserve
      )
    )
    const tokenBase =
      tokenBalanceBase < tokenLimitFromLunc
        ? tokenBalanceBase
        : tokenLimitFromLunc
    const luncBase = BigInt(
      divideBaseUnits(tokenBase, poolRatio.luncReserve, poolRatio.tokenReserve)
    )

    setTokenAmount(tokenBase > 0n ? toInputAmount(tokenBase.toString(), tokenDecimals) : "")
    setLuncAmount(
      luncBase > 0n
        ? toInputAmount(luncBase.toString(), luncDecimals)
        : ""
    )
  }, [
    luncBalance,
    luncDecimals,
    poolRatio,
    tokenBalance,
    tokenBalanceInput,
    tokenDecimals
  ])

  const handleTokenAmountChange = useCallback(
    (value: string) => {
      setTokenAmount(value)
      if (!value.trim()) {
        setLuncAmount("")
        return
      }
      const estimated = estimateLuncFromToken(value)
      if (estimated) setLuncAmount(estimated)
    },
    [estimateLuncFromToken]
  )

  const handleLuncAmountChange = useCallback(
    (value: string) => {
      setLuncAmount(value)
      if (!value.trim()) {
        setTokenAmount("")
        return
      }
      const estimated = estimateTokenFromLunc(value)
      if (estimated) setTokenAmount(estimated)
    },
    [estimateTokenFromLunc]
  )

  const provideBalanceIssue = useMemo(() => {
    if (!accountAddress || !tokenAmount.trim() || !luncAmount.trim()) {
      return undefined
    }

    try {
      const tokenBase = BigInt(
        parseTokenAmountToBaseUnits(tokenAmount, tokenDecimals, `${tokenSymbol} amount`)
      )
      const luncBase = BigInt(
        parseTokenAmountToBaseUnits(luncAmount, luncDecimals, `${luncSymbol} amount`)
      )
      if (/^\d+$/.test(tokenBalance) && tokenBase > BigInt(tokenBalance)) {
        return `Insufficient ${tokenSymbol} balance.`
      }
      if (/^\d+$/.test(luncBalance) && luncBase > BigInt(luncBalance)) {
        return `Insufficient ${luncSymbol} balance.`
      }
    } catch {
      return undefined
    }

    return undefined
  }, [
    accountAddress,
    luncAmount,
    luncBalance,
    luncDecimals,
    luncSymbol,
    tokenAmount,
    tokenBalance,
    tokenDecimals,
    tokenSymbol
  ])

  const provideEstimate = useMemo(() => {
    if (
      !tokenAmount.trim() ||
      !luncAmount.trim() ||
      !poolRatio ||
      !/^\d+$/.test(poolReserves.totalShare)
    ) {
      return undefined
    }

    try {
      const tokenBase = BigInt(
        parseTokenAmountToBaseUnits(tokenAmount, tokenDecimals, `${tokenSymbol} amount`)
      )
      const luncBase = BigInt(
        parseTokenAmountToBaseUnits(luncAmount, luncDecimals, `${luncSymbol} amount`)
      )
      const totalShare = BigInt(poolReserves.totalShare)
      if (tokenBase <= 0n || luncBase <= 0n || totalShare <= 0n) {
        return undefined
      }

      const lpFromToken = (tokenBase * totalShare) / poolRatio.tokenReserve
      const lpFromLunc = (luncBase * totalShare) / poolRatio.luncReserve
      const lpFromTx = minBigInt(lpFromToken, lpFromLunc)
      if (lpFromTx <= 0n) return undefined

      return {
        tokenPerLp: formatAmountPerLp(tokenBase, lpFromTx, tokenDecimals, lpDecimals),
        luncPerLp: formatAmountPerLp(
          luncBase,
          lpFromTx,
          luncDecimals,
          lpDecimals
        ),
        lpFromTxBase: lpFromTx.toString(),
        lpFromTx: formatBaseUnitsToTokenAmount(lpFromTx.toString(), lpDecimals, 6),
        poolShareAfter: formatPercentFromRatio(lpFromTx, totalShare + lpFromTx)
      }
    } catch {
      return undefined
    }
  }, [
    lpDecimals,
    luncAmount,
    luncDecimals,
    luncSymbol,
    poolRatio,
    poolReserves.totalShare,
    tokenAmount,
    tokenDecimals,
    tokenSymbol
  ])

  const withdrawBalanceIssue = useMemo(() => {
    if (!accountAddress || !lpAmount.trim()) {
      return undefined
    }

    try {
      const lpBase = BigInt(
        parseTokenAmountToBaseUnits(lpAmount, lpDecimals, "LP token amount")
      )
      if (/^\d+$/.test(lpBalance) && lpBase > BigInt(lpBalance)) {
        return "Insufficient LP balance."
      }
    } catch {
      return undefined
    }

    return undefined
  }, [accountAddress, lpAmount, lpBalance, lpDecimals])

  const withdrawEstimate = useMemo(() => {
    if (
      !lpAmount.trim() ||
      !poolRatio ||
      !/^\d+$/.test(poolReserves.totalShare)
    ) {
      return undefined
    }

    try {
      const lpBase = BigInt(
        parseTokenAmountToBaseUnits(lpAmount, lpDecimals, "LP token amount")
      )
      const totalShare = BigInt(poolReserves.totalShare)
      if (totalShare <= 0n || lpBase > totalShare) return undefined

      const tokenOut = divideBaseUnits(
        lpBase,
        poolRatio.tokenReserve,
        totalShare
      )
      const luncOut = divideBaseUnits(lpBase, poolRatio.luncReserve, totalShare)
      return {
        token: formatBaseUnitsToTokenAmount(tokenOut, tokenDecimals, 6),
        lunc: formatBaseUnitsToTokenAmount(luncOut, luncDecimals, 6)
      }
    } catch {
      return undefined
    }
  }, [
    lpAmount,
    lpDecimals,
    luncDecimals,
    poolRatio,
    poolReserves.totalShare,
    tokenDecimals
  ])

  const refreshLiquidityData = async () => {
    await Promise.all([
      refetchNativeBalances(),
      refetchCw20Balances(),
      refetchLpBalance(),
      refetchPoolInfo(),
      queryClient.invalidateQueries({
        queryKey: ["market", chain.chainId, "pool-live", dexId, pairAddress]
      }),
      queryClient.invalidateQueries({
        queryKey: [
          "market",
          "liquidity",
          "pool",
          chain.chainId,
          resolvedPairAddress
        ]
      }),
      queryClient.invalidateQueries({ queryKey: ["market", "pools"] })
    ])
  }

  const handleProvideLiquidity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!liquidityEnabled || !resolvedPairAddress || !tokenAsset || !luncAsset) {
      setProvideError("Liquidity is not available for this pair yet.")
      return
    }
    if (!connectorId || !accountAddress) {
      setProvideError("Connect a wallet first.")
      return
    }

    try {
      setProvideSubmitting(true)
      setProvideError(undefined)
      setProvideTxHash("")
      const tokenBaseAmount = parseTokenAmountToBaseUnits(
        tokenAmount,
        tokenDecimals,
        `${tokenSymbol} amount`
      )
      const luncBaseAmount = parseTokenAmountToBaseUnits(
        luncAmount,
        luncDecimals,
        `${luncSymbol} amount`
      )
      if (
        /^\d+$/.test(tokenBalance) &&
        BigInt(tokenBaseAmount) > BigInt(tokenBalance)
      ) {
        throw new Error(`Insufficient ${tokenSymbol} balance.`)
      }
      if (
        /^\d+$/.test(luncBalance) &&
        BigInt(luncBaseAmount) > BigInt(luncBalance)
      ) {
        throw new Error(`Insufficient ${luncSymbol} balance.`)
      }
      startTx(`Add ${tokenSymbol} / ${luncSymbol} liquidity`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const liquidityMessages = [
        { asset: tokenAsset, amount: tokenBaseAmount },
        { asset: luncAsset, amount: luncBaseAmount }
      ]
      const allowanceMessages = liquidityMessages.flatMap((item) =>
        item.asset.type === "cw20"
          ? [
              buildIncreaseAllowanceMessage({
                sender: signerAddress,
                tokenAddress: item.asset.contract,
                spender: resolvedPairAddress,
                amount: item.amount
              })
            ]
          : []
      )
      const provideMessage = supportsGarudaLiquidity
        ? (() => {
            if (!garudaAssetOrder) {
              throw new Error("Pool information is still loading.")
            }
            const amountByAssetId = new Map(
              liquidityMessages.map((item) => [item.asset.id, item])
            )
            const asset1 = amountByAssetId.get(garudaAssetOrder[0])
            const asset2 = amountByAssetId.get(garudaAssetOrder[1])
            if (!asset1 || !asset2) {
              throw new Error("Pool asset order is not available.")
            }
            return buildProvideGarudaLiquidityMessage({
              sender: signerAddress,
              pairAddress: resolvedPairAddress,
              minLiquidity: applySlippageBps(
                provideEstimate?.lpFromTxBase,
                slippageBps
              ),
              asset1: {
                info: toGarudaAssetInfo(asset1.asset),
                amount: asset1.amount
              },
              asset2: {
                info: toGarudaAssetInfo(asset2.asset),
                amount: asset2.amount
              }
            })
          })()
        : buildProvideStandardLiquidityMessage({
            sender: signerAddress,
            pairAddress: resolvedPairAddress,
            slippageTolerance: bpsToSlippageTolerance(slippageBps),
            assets: liquidityMessages.map((item) => ({
              info: toStandardAssetInfo(item.asset),
              amount: item.amount
            }))
          })
      const result = await client.signAndBroadcast(
        signerAddress,
        [...allowanceMessages, provideMessage],
        "auto",
        "Burrito add liquidity"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Add liquidity failed")
      }
      setProvideTxHash(result.transactionHash)
      setTokenAmount("")
      setLuncAmount("")
      await refreshLiquidityData()
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Add liquidity failed.")
      setProvideError(message)
      failTx(message)
    } finally {
      setProvideSubmitting(false)
    }
  }

  const handleWithdrawLiquidity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!liquidityEnabled || !resolvedPairAddress || !lpTokenAddress) {
      setWithdrawError("LP token information is not available for this pair.")
      return
    }
    if (!connectorId || !accountAddress) {
      setWithdrawError("Connect a wallet first.")
      return
    }

    try {
      setWithdrawSubmitting(true)
      setWithdrawError(undefined)
      setWithdrawTxHash("")
      const amount = parseTokenAmountToBaseUnits(
        lpAmount,
        lpDecimals,
        "LP token amount"
      )
      startTx(`Remove ${tokenSymbol} / ${luncSymbol} liquidity`)
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const withdrawMessages = supportsGarudaLiquidity
        ? [
            buildIncreaseAllowanceMessage({
              sender: signerAddress,
              tokenAddress: lpTokenAddress,
              spender: resolvedPairAddress,
              amount
            }),
            buildWithdrawGarudaLiquidityMessage({
              sender: signerAddress,
              pairAddress: resolvedPairAddress,
              lpAmount: amount
            })
          ]
        : [
            buildWithdrawTerraswapLiquidityMessage({
              sender: signerAddress,
              pairAddress: resolvedPairAddress,
              lpTokenAddress,
              lpAmount: amount
            })
          ]
      const result = await client.signAndBroadcast(
        signerAddress,
        withdrawMessages,
        "auto",
        "Burrito remove liquidity"
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Remove liquidity failed")
      }
      setWithdrawTxHash(result.transactionHash)
      setLpAmount("")
      await refreshLiquidityData()
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Remove liquidity failed.")
      setWithdrawError(message)
      failTx(message)
    } finally {
      setWithdrawSubmitting(false)
    }
  }

  const unsupportedLiquidityLabel = liquidityInfoLoading
    ? "Loading pool"
    : "Unsupported pair"
  const unsupportedLiquidityMessage = liquidityInfoLoading
    ? "Pool information is loading."
    : unsupportedPairType
    ? "This pool uses a custom concentrated liquidity contract, so proportional liquidity controls are disabled."
    : unsupportedWesoPool
    ? "WESO DeFi liquidity controls are available only for AMM pools with a separate LP token. Bonding and wrapped-token pools use trade controls instead."
    : `Liquidity controls are available for standard AMM pairs on Terraswap, Astroport, Terraport, Garuda, and WESO DeFi. This pair is listed on ${dexLabel}.`

  if (!liquidityEnabled) {
    return (
      <section className={`card ${styles.liquidityCard}`}>
        <div className={styles.liquidityHeader}>
          <span>Liquidity</span>
          <strong>{unsupportedLiquidityLabel}</strong>
        </div>
        <p className={styles.liquidityNotice}>{unsupportedLiquidityMessage}</p>
      </section>
    )
  }

  const renderSlippageControl = (placeholder = false) => {
    if (placeholder) {
      return (
        <div
          className={`${styles.liquiditySlippageControl} ${styles.liquiditySlippageControlPlaceholder}`}
          aria-hidden="true"
        />
      )
    }

    return (
      <div className={styles.liquiditySlippageControl}>
        {SLIPPAGE_OPTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`${styles.liquiditySlippageButton} ${
              slippageBps === item.bps ? styles.liquiditySlippageButtonActive : ""
            }`}
            onClick={() => setSlippageBps(item.bps)}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <section className={`card ${styles.liquidityCard}`}>
      <div className={styles.liquidityTopMeta}>
        <p className={styles.liquidityFormHint}>{modeHint}</p>
        {renderSlippageControl(!isProvideMode)}
      </div>

      {isProvideMode ? (
        <form className={styles.liquidityForm} onSubmit={handleProvideLiquidity}>
          <div className={styles.liquidityAssetBox}>
            <div className={styles.liquidityAssetTop}>
              <span>Asset</span>
              <button
                type="button"
                disabled={!tokenBalanceInput && !luncBalanceInput}
                onClick={setBalancedMax}
              >
                Max
              </button>
            </div>
            <div className={styles.liquidityAssetInputRow}>
              <span className={styles.liquidityAssetPill}>
                <span className={styles.liquidityAssetPillValue}>
                  <SwapAssetIcon
                    symbol={tokenSymbol}
                    candidates={tokenDisplayIconCandidates}
                    size={22}
                  />
                  <span>{tokenSymbol}</span>
                </span>
              </span>
              <input
                aria-label={`${tokenSymbol} amount`}
                value={tokenAmount}
                onChange={(event) => handleTokenAmountChange(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <div className={styles.liquidityAssetFooter}>
              <span>Balance: {formatBalance(tokenBalance, tokenDecimals)}</span>
            </div>
          </div>

          <div className={styles.liquidityOperator} aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M12 5.5v13M5.5 12h13"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.9"
              />
            </svg>
          </div>

          <div className={styles.liquidityAssetBox}>
            <div className={styles.liquidityAssetTop}>
              <span>Asset</span>
              <button
                type="button"
                disabled={!tokenBalanceInput && !luncBalanceInput}
                onClick={setBalancedMax}
              >
                Max
              </button>
            </div>
            <div className={styles.liquidityAssetInputRow}>
              <span className={styles.liquidityAssetPill}>
                <span className={styles.liquidityAssetPillValue}>
                  <SwapAssetIcon
                    symbol={luncSymbol}
                    candidates={luncIconCandidates}
                    size={22}
                  />
                  <span>{luncSymbol}</span>
                </span>
              </span>
              <input
                aria-label={`${luncSymbol} amount`}
                value={luncAmount}
                onChange={(event) => handleLuncAmountChange(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <div className={styles.liquidityAssetFooter}>
              <span>
                Balance:{" "}
                {formatBalance(
                  luncBalance,
                  luncDecimals
                )}
              </span>
            </div>
          </div>

          <section className={styles.liquidityDetails}>
            <button
              type="button"
              className={styles.liquidityDetailsHeader}
              aria-expanded={provideDetailsOpen}
              onClick={() => setProvideDetailsOpen((current) => !current)}
            >
              <span className={styles.liquidityDetailsTitle}>Details</span>
              <span className={styles.liquidityDetailsToggle}>
                {provideDetailsOpen ? "Hide ▴" : "Show ▾"}
              </span>
            </button>

            {provideDetailsOpen ? (
              <div className={styles.liquidityDetailsBody}>
                <div className={styles.liquidityEstimateRows}>
                  <div>
                    <span>Pool ratio</span>
                    <strong>
                      {poolRatio
                        ? `1 ${tokenSymbol} = ${formatRatio(poolRatio.luncPerToken)} ${luncSymbol}`
                        : "Set by first liquidity"}
                    </strong>
                  </div>
                  <div>
                    <span>{luncSymbol} per LP</span>
                    <strong>{provideEstimate?.luncPerLp ?? currentLpPrice?.luncPerLp ?? "--"}</strong>
                  </div>
                  <div>
                    <span>{tokenSymbol} per LP</span>
                    <strong>
                      {provideEstimate?.tokenPerLp ?? currentLpPrice?.tokenPerLp ?? "--"}
                    </strong>
                  </div>
                  <div>
                    <span>LP from Tx</span>
                    <strong>
                      {provideEstimate ? `${provideEstimate.lpFromTx} LP` : "--"}
                    </strong>
                  </div>
                  <div>
                    <span>Pool share after Tx</span>
                    <strong>{provideEstimate?.poolShareAfter ?? "--"}</strong>
                  </div>
                  <div>
                    <span>Network fee</span>
                    <strong>Auto</strong>
                  </div>
                </div>

                <p className={styles.liquidityNotice}>
                  Estimates use current pool reserves. Final LP and fee can change if
                  the pool moves before confirmation.
                </p>
              </div>
            ) : null}
          </section>

          {provideError || provideBalanceIssue ? (
            <div className={styles.liquidityError}>
              {provideError ?? provideBalanceIssue}
            </div>
          ) : null}
          {provideTxHash ? (
            <a
              className={styles.liquidityTxLink}
              href={getTxExplorerUrl(chainKey, provideTxHash)}
              target="_blank"
              rel="noreferrer"
            >
              Add tx {truncateHash(provideTxHash)}
            </a>
          ) : null}
          <button
            className={`uiButton uiButtonPrimary ${styles.liquiditySubmitButton}`}
            type="submit"
            disabled={
              provideSubmitting ||
              !connectorId ||
              !accountAddress ||
              !tokenAmount.trim() ||
              !luncAmount.trim() ||
              (supportsGarudaLiquidity && !garudaAssetOrder) ||
              Boolean(provideBalanceIssue)
            }
          >
            {provideSubmitting
              ? "Broadcasting..."
              : !connectorId || !accountAddress
                ? "Connect wallet first"
                : supportsGarudaLiquidity && !garudaAssetOrder
                  ? "Loading pool"
                : "Add"}
          </button>
        </form>
      ) : (
        <form className={styles.liquidityForm} onSubmit={handleWithdrawLiquidity}>
          <div className={styles.liquidityAssetBox}>
            <div className={styles.liquidityAssetTop}>
              <span>LP</span>
              <button
                type="button"
                disabled={!lpBalanceInput}
                onClick={() => setLpAmount(lpBalanceInput)}
              >
                Max
              </button>
            </div>
            <div className={styles.liquidityAssetInputRow}>
              <span className={styles.liquidityAssetPill}>
                <span className={styles.liquidityAssetPillValue}>
                  <span className={styles.liquidityLpIconStack} aria-hidden="true">
                    <span className={styles.liquidityLpIconPrimary}>
                      <SwapAssetIcon
                        symbol={tokenSymbol}
                        candidates={tokenDisplayIconCandidates}
                        size={22}
                      />
                    </span>
                    <span className={styles.liquidityLpIconSecondary}>
                      <SwapAssetIcon
                        symbol={luncSymbol}
                        candidates={luncIconCandidates}
                        size={22}
                      />
                    </span>
                  </span>
                  <span>LP</span>
                </span>
              </span>
              <input
                aria-label="LP token amount"
                value={lpAmount}
                onChange={(event) => setLpAmount(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <div className={styles.liquidityAssetFooter}>
              <span>Balance: {formatBalance(lpBalance, lpDecimals)}</span>
            </div>
          </div>

          <div className={styles.liquidityOperator} aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M12 5.5v11"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.9"
              />
              <path
                d="M7.75 12.75 12 17l4.25-4.25"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.9"
              />
            </svg>
          </div>

          <div className={styles.liquidityReceiveBox}>
            <div className={styles.liquidityReceiveTop}>
              <span>Received</span>
            </div>
            <div className={styles.liquidityReceiveRows}>
              <div className={styles.liquidityReceiveRow}>
                <span className={styles.liquidityReceiveAsset}>
                  <SwapAssetIcon
                    symbol={tokenSymbol}
                    candidates={tokenDisplayIconCandidates}
                    size={22}
                  />
                  <span>{tokenSymbol}</span>
                </span>
                <strong>{withdrawEstimate?.token ?? "0.00"}</strong>
              </div>
              <div className={styles.liquidityReceiveRow}>
                <span className={styles.liquidityReceiveAsset}>
                  <SwapAssetIcon
                    symbol={luncSymbol}
                    candidates={luncIconCandidates}
                    size={22}
                  />
                  <span>{luncSymbol}</span>
                </span>
                <strong>{withdrawEstimate?.lunc ?? "0.00"}</strong>
              </div>
            </div>
          </div>

          <p className={styles.liquidityNotice}>
            Estimated from current pool reserves and your LP share.
          </p>

          {withdrawError || withdrawBalanceIssue ? (
            <div className={styles.liquidityError}>
              {withdrawError ?? withdrawBalanceIssue}
            </div>
          ) : null}
          {withdrawTxHash ? (
            <a
              className={styles.liquidityTxLink}
              href={getTxExplorerUrl(chainKey, withdrawTxHash)}
              target="_blank"
              rel="noreferrer"
            >
              Remove tx {truncateHash(withdrawTxHash)}
            </a>
          ) : null}
          <button
            className={`uiButton uiButtonPrimary ${styles.liquiditySubmitButton}`}
            type="submit"
            disabled={
              withdrawSubmitting ||
              !connectorId ||
              !accountAddress ||
              !lpTokenAddress ||
              !lpAmount.trim() ||
              Boolean(withdrawBalanceIssue)
            }
          >
            {withdrawSubmitting
              ? "Broadcasting..."
              : !connectorId || !accountAddress
                ? "Connect wallet first"
                : !lpTokenAddress
                  ? "LP token unavailable"
                  : "Remove"}
          </button>
        </form>
      )}
    </section>
  )
}

export default MarketLiquidityPanel
