import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { IChartApi, IPriceLine, ISeriesApi, MouseEventHandler, Time, UTCTimestamp } from "lightweight-charts"
import PageShell from "../PageShell"
import SwapPanel from "../components/SwapPanel"
import MarketPairAssetIcon from "./MarketPairAssetIcon"
import MarketPairChartPanel from "./MarketPairChartPanel"
import BondingCurveSwapPanel from "./BondingCurveSwapPanel"
import MarketLiquidityPanel from "./MarketLiquidityPanel"
import MarketRecentTrades from "./MarketRecentTrades"
import styles from "../MarketPairDetails.module.css"
import { fetchPrices } from "../../app/data/classic"
import {
  fetchCirculatingSnapshot,
  fetchCurrentPhoenixDashboardSnapshot
} from "../../app/data/dashboard"
import { useCw20Supplies } from "../../app/data/cw20"
import {
  type PairCandle,
  fetchPairCandles,
  fetchPairTrades,
  fetchMarketDexPairs,
  fetchMarketPoolLive,
  fetchMarketPools,
  fetchMarketSpotPrice
} from "../../app/data/market"
import {
  useResolvedNativeWhitelist,
  useResolvedIbcWhitelist,
  useResolvedCw20Whitelist
} from "../../app/data/terraAssets"
import { useDexEstimatedPrices } from "../../app/data/dexPrices"
import {
  formatNumber,
  formatNumberNoRoundByNonZeroFractionDigits,
  formatPercent,
  truncateHash,
  toUnitAmount
} from "../../app/utils/format"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates,
  buildIbcAssetIconCandidates
} from "../../app/utils/assetIcons"
import {
  normalizeAssetKey,
  resolveNativeAssetIdentity
} from "../../app/utils/assetIdentity"
import { splitDexLabel } from "../../app/utils/dexDisplay"
import { getAssetProvenanceLabel } from "../../app/utils/assetProvenance"
import { formatUsdCompact } from "../../app/utils/numberDisplay"
import {
  MIN_CANDLES_FOR_CHART,
  TIMEFRAME_BUCKET_MS,
  TIMEFRAME_LOOKBACK_BUCKETS,
  chartPriceMinMove,
  formatAxisPrice,
  formatChartAxisPrice,
  formatChartTickTime,
  formatChartTime,
  formatChartUsdPerBase,
  formatUsdNoRound,
  resolveChartEventTime,
  type Timeframe
} from "../../app/market/pairChart"
import { calculatePoolLiquidityUsd } from "../../app/market/liquidity"
import { deriveUsdPriceGraphFromPools } from "../../app/market/priceGraph"
import { guardChainRelativeValuation } from "../../app/market/valuationGuard"
import { calculatePairPriceChange } from "../../app/market/priceChange"
import { supportsReserveRatioPricing } from "../../app/market/poolPricing"
import { useAppChain } from "../../app/appChainContext"
import { getAddressExplorerUrl } from "../../app/explorer"

type MarketDetailLocationState = {
  fromMarket?: boolean
  fromLaunchpad?: boolean
  marketLocation?: {
    pathname?: string
    search?: string
    hash?: string
  }
  launchpadLocation?: {
    pathname?: string
    search?: string
    hash?: string
  }
}

const LAUNCHPAD_EXPLORE_PATH = "/launchpad?tab=explore"
const DETAIL_TRADES_MAX_PAGES = 8
const DETAIL_CANDLE_TX_MAX_PAGES: Record<Timeframe, number> = {
  "1h": 6,
  "24h": 8,
  "7d": 12
}
const DETAIL_TRADER_STATS_LIMIT = 400
const TIMEFRAME_WINDOW_MS: Record<Timeframe, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
}

type ResolvedAsset = {
  id: string
  key: string
  symbol: string
  name: string
  decimals: number
  iconCandidates: string[]
  isLunc: boolean
  isUstc: boolean
  provenanceLabel?: string
  originChainId?: string
  originDenom?: string
  issuer?: string
  transport?: string
}

type DetailCopyItem = {
  key: string
  label: string
  value: string
  displayValue: string
  copyLabel: string
}

type SidePanelMode = "swap" | "add" | "remove"

type ChartRuntime = {
  chart: IChartApi
  priceSeries: ISeriesApi<"Candlestick">
  volumeSeries: ISeriesApi<"Histogram">
  closeLine: IPriceLine
  openLine: IPriceLine
  candleByTimestamp: Map<number, PairCandle>
}

const updateChartCandles = (
  runtime: ChartRuntime,
  candles: PairCandle[],
  formatter: (value: number) => string
) => {
  const candleByTimestamp = new Map<number, PairCandle>()
  runtime.priceSeries.applyOptions({
    priceFormat: {
      type: "custom",
      minMove: chartPriceMinMove(candles.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close])),
      formatter
    }
  })
  runtime.priceSeries.setData(candles.map((candle) => {
    const time = Math.floor(candle.bucketStart / 1000) as UTCTimestamp
    candleByTimestamp.set(Number(time), candle)
    return { time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }
  }))
  runtime.volumeSeries.setData(candles.filter((candle) => candle.volumeKnown !== false).map((candle) => ({
    time: Math.floor(candle.bucketStart / 1000) as UTCTimestamp,
    value: candle.volumeQuote,
    color: document.documentElement.dataset.theme === "light"
      ? candle.close >= candle.open ? "rgba(22, 132, 64, 0.3)" : "rgba(196, 52, 67, 0.3)"
      : candle.close >= candle.open ? "rgba(101, 228, 48, 0.28)" : "rgba(255, 106, 106, 0.28)"
  })))
  runtime.candleByTimestamp = candleByTimestamp
  const last = candles[candles.length - 1]
  const light = document.documentElement.dataset.theme === "light"
  const priceColor = last.close >= last.open
    ? light ? "#168440" : "#6cec3d"
    : light ? "#c43443" : "#ff6a6a"
  runtime.closeLine.applyOptions({
    price: last.close,
    color: priceColor,
    axisLabelColor: priceColor,
    axisLabelTextColor: light ? "#fff" : "#08110d"
  })
  runtime.openLine.applyOptions({ price: candles[0].open })
}

const toPairFallbackAsset = (assetId: string) => {
  if (assetId.startsWith("native:")) return assetId.slice("native:".length)
  if (assetId.startsWith("cw20:")) return assetId.slice("cw20:".length)
  return assetId
}

const buildNativeIconCandidates = (
  denom: string,
  symbol: string,
  primaryIcon?: string
) => buildClassicNativeIconCandidates({ denom, symbol, primaryIcon })

const buildIbcIconCandidates = ({
  ibcIcon,
  hexxagonIcon,
  symbol,
  baseDenom
}: {
  ibcIcon?: string
  hexxagonIcon?: string
  symbol?: string
  baseDenom?: string
}) =>
  buildIbcAssetIconCandidates([hexxagonIcon, ibcIcon], "/system/ibc.svg", {
    symbol,
    baseDenom
  })

const shouldSwapForDisplay = (left: ResolvedAsset, right: ResolvedAsset) => {
  const leftIsCw20 = left.id.startsWith("cw20:")
  const rightIsCw20 = right.id.startsWith("cw20:")

  if (leftIsCw20 !== rightIsCw20) {
    return !leftIsCw20 && rightIsCw20
  }

  if (left.isUstc && right.isLunc) return true
  return false
}

const buildDetailCopyItem = (
  key: string,
  asset: ResolvedAsset
): DetailCopyItem => {
  if (asset.id.startsWith("cw20:")) {
    const contract = asset.id.slice("cw20:".length)
    return {
      key,
      label: asset.symbol,
      value: contract,
      displayValue: truncateHash(contract, 8, 7),
      copyLabel: "contract"
    }
  }

  const denom = asset.id.startsWith("native:")
    ? asset.id.slice("native:".length)
    : asset.id

  return {
    key,
    label: asset.symbol,
    value: denom,
    displayValue: denom,
    copyLabel: "denom"
  }
}

const MarketPairDetails = () => {
  const { chain, chainKey } = useAppChain()
  const params = useParams<{ pairId?: string; dexId?: string; pair?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [timeframe, setTimeframe] = useState<Timeframe>("24h")
  const [tradePager, setTradePager] = useState<{ pair: string; limit: number }>({
    pair: "",
    limit: 25
  })
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("swap")
  const [copiedAddressKey, setCopiedAddressKey] = useState("")
  const [activeCandleTime, setActiveCandleTime] = useState<number | null>(null)
  const chartHostRef = useRef<HTMLDivElement | null>(null)
  const chartTooltipRef = useRef<HTMLDivElement | null>(null)
  const chartRuntimeRef = useRef<ChartRuntime | null>(null)
  const chartDisplayRef = useRef({ baseSymbol: "", quoteSymbol: "", quoteUsd: undefined as number | undefined })
  const candlesRef = useRef<PairCandle[]>([])
  const isLaunchpadSource = useMemo(() => {
    const state = location.state as MarketDetailLocationState | null
    if (state?.fromLaunchpad) return true
    return new URLSearchParams(location.search).get("from") === "launchpad"
  }, [location.search, location.state])
  const fallbackBackTo = isLaunchpadSource ? LAUNCHPAD_EXPLORE_PATH : "/market"
  const handleBack = useCallback(() => {
    const state = location.state as MarketDetailLocationState | null
    if (state?.fromLaunchpad || isLaunchpadSource) {
      const fallbackLocation = state?.launchpadLocation
      if (fallbackLocation?.pathname) {
        navigate({
          pathname: fallbackLocation.pathname,
          search: fallbackLocation.search ?? "",
          hash: fallbackLocation.hash ?? ""
        })
        return
      }
      navigate(LAUNCHPAD_EXPLORE_PATH)
      return
    }

    const historyIndex =
      typeof window !== "undefined" && typeof window.history.state?.idx === "number"
        ? window.history.state.idx
        : 0

    if (state?.fromMarket && historyIndex > 0) {
      navigate(-1)
      return
    }

    const fallbackLocation = state?.marketLocation
    if (fallbackLocation?.pathname === "/market") {
      navigate({
        pathname: fallbackLocation.pathname,
        search: fallbackLocation.search ?? "",
        hash: fallbackLocation.hash ?? ""
      })
      return
    }

    navigate("/market")
  }, [isLaunchpadSource, location.state, navigate])

  const decodedPairId = useMemo(() => {
    const decode = (value?: string) => {
      if (!value) return ""
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }

    if (params.dexId && params.pair) {
      const dexId = decode(params.dexId).toLowerCase()
      const pair = decode(params.pair).toLowerCase()
      if (!dexId || !pair) return ""
      return `${dexId}:${pair}`
    }

    if (!params.pairId) return ""
    return decode(params.pairId)
  }, [params.dexId, params.pair, params.pairId])

  const { data: pairs = [], isLoading: isPairsLoading } = useQuery({
    queryKey: ["market", chain.chainId, "pairs"],
    queryFn: fetchMarketDexPairs,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000
  })

  const { data: pools = [], isLoading: isPoolsLoading } = useQuery({
    queryKey: [
      "market",
      chain.chainId,
      "pools",
      pairs.map((pair) => pair.pair).join(",")
    ],
    queryFn: () => fetchMarketPools(pairs),
    enabled: pairs.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000
  })

  const selectedPool = useMemo(() => {
    if (!decodedPairId) return undefined
    const lowerPairId = decodedPairId.toLowerCase()
    return pools.find((pool) => `${pool.dexId}:${pool.pair}`.toLowerCase() === lowerPairId)
  }, [decodedPairId, pools])

  const selectedPairForLivePool = useMemo(() => {
    if (!selectedPool) return undefined
    return {
      pair: selectedPool.pair,
      dexId: selectedPool.dexId,
      dexLabel: selectedPool.dexLabel,
      type: selectedPool.type,
      assets: [
        toPairFallbackAsset(selectedPool.poolAssets[0].id),
        toPairFallbackAsset(selectedPool.poolAssets[1].id)
      ] as [string, string]
    }
  }, [selectedPool])

  const { data: liveSelectedPool } = useQuery({
    queryKey: [
      "market",
      chain.chainId,
      "pool-live",
      selectedPairForLivePool?.dexId,
      selectedPairForLivePool?.pair
    ],
    queryFn: () => fetchMarketPoolLive(selectedPairForLivePool!),
    enabled: Boolean(selectedPairForLivePool),
    staleTime: 45_000,
    refetchInterval: 90_000
  })

  const displayPool = useMemo(
    () =>
      liveSelectedPool && selectedPool
        ? {
            ...liveSelectedPool,
            volumes: liveSelectedPool.volumes ?? selectedPool.volumes
          }
        : liveSelectedPool ?? selectedPool,
    [liveSelectedPool, selectedPool]
  )

  const poolsForMetadata = useMemo(
    () => (displayPool ? [displayPool] : []),
    [displayPool]
  )

  const cw20Contracts = useMemo(() => {
    const set = new Set<string>()
    poolsForMetadata.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id.startsWith("cw20:")) return
        set.add(asset.id.slice(5).toLowerCase())
      })
    })
    return Array.from(set)
  }, [poolsForMetadata])
  const nativeDenoms = useMemo(() => {
    const set = new Set<string>()
    poolsForMetadata.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id.startsWith("native:")) return
        const denom = asset.id.slice(7)
        if (!denom || denom.startsWith("ibc/")) return
        set.add(denom.toLowerCase())
      })
    })
    return Array.from(set)
  }, [poolsForMetadata])
  const ibcDenoms = useMemo(() => {
    const set = new Set<string>()
    poolsForMetadata.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id.startsWith("native:ibc/")) return
        set.add(asset.id.slice(7))
      })
    })
    return Array.from(set)
  }, [poolsForMetadata])

  const { data: nativeWhitelist = {} } = useResolvedNativeWhitelist(nativeDenoms)
  const { data: ibcWhitelist = {} } = useResolvedIbcWhitelist(ibcDenoms)
  const { data: cw20Whitelist = {} } = useResolvedCw20Whitelist(cw20Contracts)

  const { data: prices } = useQuery({
    queryKey: ["prices", chain.chainId],
    queryFn: fetchPrices,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })
  const nativePrice = chainKey === "luna" ? prices?.luna : prices?.lunc

  const { data: dashboardSnapshot } = useQuery({
    queryKey: ["dashboard", chain.chainId, "circulating", "market-pair"],
    queryFn: () =>
      chainKey === "luna"
        ? fetchCurrentPhoenixDashboardSnapshot()
        : fetchCirculatingSnapshot(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000
  })

  const assetMetas = useMemo(() => {
    const map = new Map<string, number>()
    poolsForMetadata.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id) return
        if (asset.id.startsWith("native:")) {
          const denom = asset.id.slice(7)
          const key = normalizeAssetKey(denom)
          if (!key || map.has(key)) return
          const decimals = denom.startsWith("ibc/")
            ? (ibcWhitelist[denom.slice(4).toUpperCase()]?.decimals ??
              cw20Whitelist[`ibc/${denom.slice(4).toLowerCase()}`]?.decimals ??
              6)
            : (nativeWhitelist[denom.toLowerCase()]?.decimals ?? 6)
          map.set(key, decimals)
          return
        }
        if (asset.id.startsWith("cw20:")) {
          const contract = asset.id.slice(5).toLowerCase()
          const key = normalizeAssetKey(contract)
          if (!key || map.has(key)) return
          map.set(key, cw20Whitelist[contract]?.decimals ?? 6)
        }
      })
    })
    return Array.from(map.entries()).map(([key, decimals]) => ({ key, decimals }))
  }, [cw20Whitelist, ibcWhitelist, nativeWhitelist, poolsForMetadata])

  const { data: dexEstimatedPrices } = useDexEstimatedPrices(assetMetas)

  const poolGraphUsdPrices = useMemo(
    () =>
      deriveUsdPriceGraphFromPools({
        pools,
        seedAssetIds: ["native:uluna", "native:uusd"],
        getDecimals: (assetId) => {
          if (assetId.startsWith("native:")) {
            const denom = assetId.slice("native:".length)
            if (denom.startsWith("ibc/")) {
              return (
                ibcWhitelist[denom.slice(4).toUpperCase()]?.decimals ??
                cw20Whitelist[`ibc/${denom.slice(4).toLowerCase()}`]?.decimals ??
                6
              )
            }
            return nativeWhitelist[denom.toLowerCase()]?.decimals ?? 6
          }
          if (assetId.startsWith("cw20:")) {
            return cw20Whitelist[assetId.slice("cw20:".length).toLowerCase()]?.decimals ?? 6
          }
          return 6
        },
        getSeedUsdPrice: (_assetId, normalizedKey) => {
          if (normalizedKey === "uluna") return nativePrice?.usd
          if (normalizedKey === "uusd") return prices?.ustc?.usd
          return undefined
        }
      }),
    [cw20Whitelist, ibcWhitelist, nativePrice?.usd, nativeWhitelist, pools, prices?.ustc?.usd]
  )

  const resolveAsset = (assetId: string): ResolvedAsset => {
    if (assetId.startsWith("native:")) {
      const denom = assetId.slice(7)
      const isIbc = denom.startsWith("ibc/")
      if (isIbc) {
        const hash = denom.slice(4).toUpperCase()
        const ibc = ibcWhitelist[hash]
        const ibcHexxagon = cw20Whitelist[`ibc/${hash.toLowerCase()}`]
        const symbol = ibc?.symbol || ibcHexxagon?.symbol || "IBC"
        const name = ibc?.name || ibcHexxagon?.name || symbol
        return {
          id: assetId,
          key: normalizeAssetKey(denom),
          symbol,
          name,
            decimals: ibc?.decimals ?? ibcHexxagon?.decimals ?? 6,
            iconCandidates: buildIbcIconCandidates({
              ibcIcon: ibc?.icon,
              hexxagonIcon: ibcHexxagon?.icon,
              symbol,
              baseDenom: ibc?.base_denom
            }),
          isLunc: false,
          isUstc: false,
          provenanceLabel: ibc?.provenanceLabel,
          originChainId: ibc?.originChainId,
          originDenom: ibc?.originDenom,
          issuer: ibc?.issuer,
          transport: ibc?.transport
        }
      }
      const nativeToken = nativeWhitelist[denom.toLowerCase()]
      const identity = resolveNativeAssetIdentity({
        denom,
        candidateSymbol: nativeToken?.symbol,
        candidateName: nativeToken?.name,
        chainKey
      })
      return {
        id: assetId,
        key: normalizeAssetKey(denom),
        symbol: identity.symbol,
        name: identity.name,
        decimals: nativeToken?.decimals ?? 6,
        iconCandidates: buildNativeIconCandidates(
          denom,
          identity.symbol,
          nativeToken?.icon
        ),
        isLunc: denom === "uluna",
        isUstc: denom === "uusd"
      }
    }

    const contract = assetId.startsWith("cw20:") ? assetId.slice(5).toLowerCase() : ""
    const token = cw20Whitelist[contract]
    const symbol = token?.symbol || `${contract.slice(0, 6)}...${contract.slice(-4)}`
    return {
      id: assetId,
      key: normalizeAssetKey(contract),
      symbol,
      name: token?.name || symbol,
      decimals: token?.decimals ?? 6,
      iconCandidates: buildCw20IconCandidates(token?.icon, token?.symbol),
      isLunc: false,
      isUstc: false,
      provenanceLabel: token?.provenanceLabel,
      originChainId: token?.originChainId,
      originDenom: token?.originDenom,
      issuer: token?.issuer,
      transport: token?.transport
    }
  }

  const getAssetUsdPrice = (asset: ResolvedAsset) => {
    if (asset.isLunc) return nativePrice?.usd
    if (asset.isUstc) return prices?.ustc?.usd
    const upperSymbol = asset.symbol.trim().toUpperCase()
    if (upperSymbol === "LUNC" || upperSymbol === "LUNA") return nativePrice?.usd
    if (upperSymbol === "USTC") return prices?.ustc?.usd
    const graphEntry = poolGraphUsdPrices[asset.key]
    if (graphEntry !== undefined) return graphEntry.price
    const estimate = dexEstimatedPrices?.[asset.key]
    if (!estimate) return undefined
    const quoteUsd = estimate.quoteDenom === "uusd" ? prices?.ustc?.usd : nativePrice?.usd
    if (quoteUsd === undefined) return undefined
    return estimate.priceInQuote * quoteUsd
  }

  const getAssetChange = (asset: ResolvedAsset, tf: Timeframe) => {
    if (asset.isLunc) {
      if (tf === "1h") return nativePrice?.usd_1h_change
      if (tf === "7d") return nativePrice?.usd_7d_change
      return nativePrice?.usd_24h_change
    }
    if (asset.isUstc) {
      if (tf === "1h") return prices?.ustc?.usd_1h_change
      if (tf === "7d") return prices?.ustc?.usd_7d_change
      return prices?.ustc?.usd_24h_change
    }
    return undefined
  }

  const detail = (() => {
    if (!displayPool) return undefined

    let left = resolveAsset(displayPool.poolAssets[0].id)
    let right = resolveAsset(displayPool.poolAssets[1].id)
    let leftAmount = toUnitAmount(displayPool.poolAssets[0].amount, left.decimals)
    let rightAmount = toUnitAmount(displayPool.poolAssets[1].amount, right.decimals)

    if (shouldSwapForDisplay(left, right)) {
      ;[left, right] = [right, left]
      ;[leftAmount, rightAmount] = [rightAmount, leftAmount]
    }

    if (leftAmount <= 0 || rightAmount <= 0) return undefined

    const priceBase = left
    const priceQuote = right
    const priceValue = rightAmount / leftAmount
    const priceQuoteUsd = getAssetUsdPrice(priceQuote)
    const leftUsd = getAssetUsdPrice(left)
    const rightUsd = getAssetUsdPrice(right)
    const priceUsd =
      leftUsd ??
      (priceQuoteUsd !== undefined ? priceValue * priceQuoteUsd : undefined)
    const bondingLiquidityUsd =
      displayPool.bonding?.liquidityAssetId && displayPool.bonding?.liquidityAmount
        ? (() => {
            const liquidityAsset = resolveAsset(displayPool.bonding!.liquidityAssetId!)
            const liquidityAssetUsd = getAssetUsdPrice(liquidityAsset)
            if (liquidityAssetUsd === undefined) return undefined
            const liquidityAmount = toUnitAmount(
              displayPool.bonding!.liquidityAmount!,
              liquidityAsset.decimals
            )
            return Number.isFinite(liquidityAmount)
              ? liquidityAmount * liquidityAssetUsd
              : undefined
          })()
        : undefined
    const leftValue = leftUsd !== undefined ? leftUsd * leftAmount : undefined
    const rightValue = rightUsd !== undefined ? rightUsd * rightAmount : undefined
    const calculatedLiquidityUsd = calculatePoolLiquidityUsd({
      bondingLiquidityUsd,
      leftValue,
      pool: displayPool,
      rightValue
    })
    const finiteConfidence = [left, right]
      .map((asset) =>
        asset.isLunc || asset.isUstc
          ? Number.POSITIVE_INFINITY
          : poolGraphUsdPrices[asset.key]?.liquidity
      )
      .filter((value): value is number => value !== undefined && Number.isFinite(value))
    const confidenceLimitedLiquidityUsd =
      supportsReserveRatioPricing(displayPool.type) &&
      calculatedLiquidityUsd !== undefined &&
      finiteConfidence.length
        ? Math.min(calculatedLiquidityUsd, ...finiteConfidence)
        : calculatedLiquidityUsd
    const chainMarketCapUsd =
      nativePrice?.usd_market_cap ??
      (nativePrice?.usd !== undefined && dashboardSnapshot?.circulatingLunc
        ? nativePrice.usd * dashboardSnapshot.circulatingLunc
        : undefined)
    const liquidityUsd = guardChainRelativeValuation(
      confidenceLimitedLiquidityUsd,
      chainMarketCapUsd
    )

    let marketCapUsd: number | undefined
    if (priceBase.isLunc) {
      marketCapUsd =
        nativePrice?.usd_market_cap ??
        (nativePrice?.usd !== undefined && dashboardSnapshot?.circulatingLunc
          ? nativePrice.usd * dashboardSnapshot.circulatingLunc
          : undefined)
    } else if (priceBase.isUstc) {
      marketCapUsd =
        prices?.ustc?.usd_market_cap ??
        (prices?.ustc?.usd !== undefined && dashboardSnapshot?.circulatingUstc
          ? prices.ustc.usd * dashboardSnapshot.circulatingUstc
          : undefined)
    }

    const getPairChange = (tf: Timeframe) => {
      const baseChange = getAssetChange(priceBase, tf)
      const quoteChange = getAssetChange(priceQuote, tf)
      return calculatePairPriceChange(baseChange, quoteChange)
    }

    const getVolumeUsd = (tf: Timeframe) => {
      const volumeMap = displayPool.volumes?.[tf]
      if (!volumeMap) return undefined
      const volumeQuote = volumeMap[`${priceBase.key}|${priceQuote.key}`]
      if (volumeQuote === undefined) return undefined
      return priceQuoteUsd !== undefined ? volumeQuote * priceQuoteUsd : undefined
    }

    return {
      pool: displayPool,
      left,
      right,
      leftAmount,
      rightAmount,
      priceBase,
      priceQuote,
      priceValue,
      priceQuoteUsd,
      priceUsd,
      liquidityUsd,
      marketCapUsd,
      volumesUsd: {
        "1h": getVolumeUsd("1h"),
        "24h": getVolumeUsd("24h"),
        "7d": getVolumeUsd("7d")
      } as Record<Timeframe, number | undefined>,
      changes: {
        "1h": getPairChange("1h"),
        "24h": getPairChange("24h"),
        "7d": getPairChange("7d")
      } as Record<Timeframe, number | undefined>
    }
  })()

  const usesSimulatedSpotPrice = Boolean(
    detail && !supportsReserveRatioPricing(detail.pool.type)
  )
  const { data: simulatedSpotPrice } = useQuery({
    queryKey: [
      "market",
      chain.chainId,
      "spot-price",
      detail?.pool.pair,
      detail?.left.id,
      detail?.left.decimals,
      detail?.right.decimals
    ],
    queryFn: () =>
      fetchMarketSpotPrice({
        pairAddress: detail!.pool.pair,
        offerAssetId: detail!.left.id,
        offerDecimals: detail!.left.decimals,
        askDecimals: detail!.right.decimals
      }),
    enabled: usesSimulatedSpotPrice,
    staleTime: 30_000,
    refetchInterval: 60_000
  })
  const detailPriceValue = usesSimulatedSpotPrice
    ? simulatedSpotPrice
    : detail?.priceValue
  const detailQuoteUsd =
    usesSimulatedSpotPrice &&
    detail?.priceUsd !== undefined &&
    detailPriceValue !== undefined &&
    detailPriceValue > 0
      ? detail.priceUsd / detailPriceValue
      : detail?.priceQuoteUsd

  const liquidityTokenAsset = detail
    ? [detail.left, detail.right].find((asset) => asset.id.startsWith("cw20:"))
    : undefined
  const isBondingCurve = detail?.pool.type.startsWith("bonding-") ?? false

  useEffect(() => {
    if (isBondingCurve && sidePanelMode !== "swap") {
      setSidePanelMode("swap")
    }
  }, [isBondingCurve, sidePanelMode])

  const detailBaseCw20Contracts = useMemo(
    () =>
      detail?.priceBase.id.startsWith("cw20:")
        ? [detail.priceBase.id.slice("cw20:".length).toLowerCase()]
        : [],
    [detail?.priceBase.id]
  )
  const { data: detailCw20Supplies = {} } = useCw20Supplies(
    detailBaseCw20Contracts,
    cw20Whitelist
  )
  const detailFdvUsd = useMemo(() => {
    if (!detail?.priceBase.id.startsWith("cw20:")) return undefined
    if (detail.priceUsd === undefined) return undefined
    const contract = detail.priceBase.id.slice("cw20:".length).toLowerCase()
    const units = detailCw20Supplies[contract]?.units
    return units !== undefined ? units * detail.priceUsd : undefined
  }, [detail, detailCw20Supplies])
  const detailMarketCapUsd = detail?.marketCapUsd

  const tradesLimit =
    detail?.pool.pair && tradePager.pair === detail.pool.pair ? tradePager.limit : 25

  const { data: tradesData, isLoading: isTradesLoading } = useQuery({
    queryKey: [
      "market",
      chain.chainId,
      "pair-trades",
      detail?.pool.pair,
      detail?.left.key,
      detail?.right.key,
      detail?.left.decimals,
      detail?.right.decimals,
      tradesLimit
    ],
    queryFn: () =>
      fetchPairTrades({
        pairAddress: detail!.pool.pair,
        leftAssetKey: detail!.left.key,
        rightAssetKey: detail!.right.key,
        leftDecimals: detail!.left.decimals,
        rightDecimals: detail!.right.decimals,
        offset: 0,
        limit: tradesLimit,
        maxPages: DETAIL_TRADES_MAX_PAGES
      }),
    enabled: Boolean(detail?.pool.pair),
    staleTime: 45_000,
    refetchInterval: 90_000
  })

  const trades = useMemo(() => tradesData?.trades ?? [], [tradesData?.trades])
  const hasMoreTrades = Boolean(tradesData?.hasMore)

  const { data: traderStatsData } = useQuery({
    queryKey: [
      "market",
      chain.chainId,
      "pair-trader-stats",
      detail?.pool.pair,
      detail?.left.key,
      detail?.right.key,
      detail?.left.decimals,
      detail?.right.decimals
    ],
    queryFn: () =>
      fetchPairTrades({
        pairAddress: detail!.pool.pair,
        leftAssetKey: detail!.left.key,
        rightAssetKey: detail!.right.key,
        leftDecimals: detail!.left.decimals,
        rightDecimals: detail!.right.decimals,
        offset: 0,
        limit: DETAIL_TRADER_STATS_LIMIT,
        maxPages: DETAIL_TRADES_MAX_PAGES
      }),
    enabled: Boolean(detail?.pool.pair),
    staleTime: 60_000,
    refetchInterval: 120_000
  })
  const tradersByTimeframe = useMemo(() => {
    const source = traderStatsData?.trades?.length ? traderStatsData.trades : trades
    const now = Date.now()

    return (["1h", "24h", "7d"] as Timeframe[]).reduce(
      (acc, tf) => {
        const cutoff = now - TIMEFRAME_WINDOW_MS[tf]
        const traders = new Set(
          source
            .filter((trade) => trade.timestamp >= cutoff && trade.trader)
            .map((trade) => trade.trader)
        )
        acc[tf] = traders.size || undefined
        return acc
      },
      {} as Record<Timeframe, number | undefined>
    )
  }, [traderStatsData?.trades, trades])

  const {
    data: candlesData = [],
    isLoading: isCandlesLoading,
    isError: isCandlesError,
    refetch: refetchCandles
  } = useQuery({
    queryKey: [
      "market",
      chain.chainId,
      "pair-candles",
      detail?.pool.pair,
      detail?.left.key,
      detail?.right.key,
      detail?.left.decimals,
      detail?.right.decimals,
      timeframe
    ],
    queryFn: () =>
      fetchPairCandles({
        pairAddress: detail!.pool.pair,
        leftAssetKey: detail!.left.key,
        rightAssetKey: detail!.right.key,
        leftDecimals: detail!.left.decimals,
        rightDecimals: detail!.right.decimals,
        expectedPrice: detailPriceValue,
        bucketMs: TIMEFRAME_BUCKET_MS[timeframe],
        lookbackBuckets: TIMEFRAME_LOOKBACK_BUCKETS[timeframe],
        maxCandles: TIMEFRAME_LOOKBACK_BUCKETS[timeframe],
        maxPages: DETAIL_CANDLE_TX_MAX_PAGES[timeframe],
        minCandles: MIN_CANDLES_FOR_CHART[timeframe],
        includeLocalFallback: true
      }),
    enabled: Boolean(detail?.pool.pair && detailPriceValue),
    staleTime: 60_000,
    refetchInterval: 120_000
  })

  const candles = useMemo(
    () => {
      const merged = new Map<number, PairCandle>()

      ;[...candlesData]
        .filter(
          (candle) =>
            Number.isFinite(candle.bucketStart) &&
            Number.isFinite(candle.open) &&
            Number.isFinite(candle.high) &&
            Number.isFinite(candle.low) &&
            Number.isFinite(candle.close)
        )
        .sort((a, b) => a.bucketStart - b.bucketStart)
        .forEach((candle) => {
          const existing = merged.get(candle.bucketStart)
          if (!existing) {
            merged.set(candle.bucketStart, candle)
            return
          }

          merged.set(candle.bucketStart, {
            bucketStart: candle.bucketStart,
            open: existing.open,
            high: Math.max(existing.high, candle.high),
            low: Math.min(existing.low, candle.low),
            close: candle.close,
            volumeQuote: existing.volumeQuote + candle.volumeQuote,
            volumeKnown: existing.volumeKnown !== false && candle.volumeKnown !== false
          })
        })

      return [...merged.values()].sort((a, b) => a.bucketStart - b.bucketStart)
    },
    [candlesData]
  )

  const activeCandle = useMemo(() => {
    if (!candles.length) return undefined
    return candles.find((candle) => candle.bucketStart === activeCandleTime) ?? candles[candles.length - 1]
  }, [activeCandleTime, candles])
  const baseSymbol = detail?.left.symbol ?? ""
  const chartQuoteUsd = detailQuoteUsd
  const quoteSymbol = detail?.right.symbol ?? ""
  chartDisplayRef.current = { baseSymbol, quoteSymbol, quoteUsd: chartQuoteUsd }
  candlesRef.current = candles
  const hasCandles = candles.length > 0
  const chartPairId = detail?.pool.pair ?? ""

  useEffect(() => {
    const runtime = chartRuntimeRef.current
    if (!runtime || !candles.length) return
    updateChartCandles(
      runtime,
      candles,
      formatChartAxisPrice
    )
  }, [candles])

  const chartStats = useMemo(() => {
    if (!candles.length) return undefined
    const first = candles[0].open
    const last = candles[candles.length - 1].close
    const high = Math.max(...candles.map((candle) => candle.high))
    const low = Math.min(...candles.map((candle) => candle.low))
    return {
      start: first,
      last,
      high,
      low,
      change: first > 0 ? ((last - first) / first) * 100 : undefined
    }
  }, [candles])

  useEffect(() => {
    if (!chartHostRef.current || !hasCandles) return undefined

    const host = chartHostRef.current
    const tooltipEl = chartTooltipRef.current
    const trendLineColor = "rgba(108, 236, 61, 0.98)"
    const trendLineSoft = "rgba(108, 236, 61, 0.36)"
    let cancelled = false
    let cleanupChart: (() => void) | undefined

    void (async () => {
      const {
        CandlestickSeries,
        ColorType,
        HistogramSeries,
        LineStyle,
        TickMarkType,
        createChart
      } = await import("lightweight-charts")

      if (cancelled) return

    const chart = createChart(host, {
      autoSize: true,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(10, 16, 13, 0.72)" },
        textColor: "rgba(234, 245, 235, 0.64)",
        fontFamily: "Montserrat, sans-serif",
        fontSize: 11,
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.075)" }
      },
      rightPriceScale: {
        borderVisible: false,
        ticksVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.28 }
      },
      leftPriceScale: { visible: false },
      crosshair: {
        vertLine: {
          color: "rgba(255, 255, 255, 0.28)",
          width: 1,
          style: 2,
          labelBackgroundColor: "rgba(11, 20, 15, 0.96)"
        },
        horzLine: {
          color: "rgba(255, 255, 255, 0.22)",
          width: 1,
          style: 2,
          labelBackgroundColor: "rgba(11, 20, 15, 0.96)"
        }
      },
      timeScale: {
        borderVisible: false,
        rightOffset: 6,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, tickMarkType: number) => {
          if (typeof time !== "number") return null
          return formatChartTickTime(time, timeframe, tickMarkType, TickMarkType)
        }
      },
      localization: {
        priceFormatter: formatChartAxisPrice
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true
      }
    })

    const applyTheme = () => {
      const light = document.documentElement.dataset.theme === "light"
      chart.applyOptions({
        layout: {
          background: {
            type: ColorType.Solid,
            color: light ? "#ffffff" : "#111914"
          },
          textColor: light ? "#6c7972" : "#a5b3aa"
        },
        grid: {
          vertLines: { color: light ? "rgba(20, 46, 29, 0.06)" : "rgba(255, 255, 255, 0.04)" },
          horzLines: { color: light ? "rgba(20, 46, 29, 0.09)" : "rgba(255, 255, 255, 0.075)" }
        },
        crosshair: {
          vertLine: { color: light ? "rgba(20, 46, 29, 0.32)" : "rgba(255, 255, 255, 0.28)" },
          horzLine: { color: light ? "rgba(20, 46, 29, 0.26)" : "rgba(255, 255, 255, 0.22)" }
        }
      })
      const runtime = chartRuntimeRef.current
      if (runtime?.chart === chart) {
        const up = light ? "#168440" : "rgba(108, 236, 61, 0.96)"
        const down = light ? "#c43443" : "rgba(255, 106, 106, 0.96)"
        runtime.priceSeries.applyOptions({
          upColor: up, borderUpColor: up, wickUpColor: up,
          downColor: down, borderDownColor: down, wickDownColor: down
        })
        runtime.closeLine.applyOptions({
          color: light ? "rgba(22, 132, 64, 0.5)" : trendLineSoft,
          axisLabelColor: up,
          axisLabelTextColor: light ? "#ffffff" : "#08110d"
        })
        updateChartCandles(runtime, candlesRef.current, formatChartAxisPrice)
      }
    }
    applyTheme()
    const themeObserver = new MutationObserver(applyTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    const priceSeries = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(108, 236, 61, 0.92)",
      downColor: "rgba(255, 106, 106, 0.92)",
      borderVisible: true,
      borderUpColor: "rgba(108, 236, 61, 0.98)",
      borderDownColor: "rgba(255, 106, 106, 0.98)",
      wickUpColor: "rgba(108, 236, 61, 0.96)",
      wickDownColor: "rgba(255, 106, 106, 0.96)",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "custom",
        minMove: chartPriceMinMove(candlesRef.current.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close])),
        formatter: formatChartAxisPrice
      }
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
      base: 0
    })

    chart.priceScale("").applyOptions({
      visible: false,
      scaleMargins: {
        top: 0.78,
        bottom: 0
      }
    })

    const closeLine = priceSeries.createPriceLine({
      price: candlesRef.current[candlesRef.current.length - 1].close,
      color: trendLineSoft,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      axisLabelColor: trendLineColor,
      axisLabelTextColor: "#08110d"
    })
    const openLine = priceSeries.createPriceLine({
      price: candlesRef.current[0].open,
      color: "rgba(234, 245, 235, 0.14)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      lineVisible: true,
      axisLabelVisible: false
    })
    const runtime: ChartRuntime = {
      chart,
      priceSeries,
      volumeSeries,
      closeLine,
      openLine,
      candleByTimestamp: new Map()
    }
    chartRuntimeRef.current = runtime
    updateChartCandles(runtime, candlesRef.current, formatChartAxisPrice)
    applyTheme()

    const hideTooltip = () => {
      if (tooltipEl) {
        tooltipEl.style.opacity = "0"
        tooltipEl.style.transform = "translateY(4px)"
      }
    }

    let hoveredCandleTime: number | null = null

    const handleCrosshairMove: MouseEventHandler<Time> = (param) => {
      if (
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        param.point.x > host.clientWidth ||
        param.point.y > host.clientHeight
      ) {
        hideTooltip()
        if (hoveredCandleTime !== null) {
          hoveredCandleTime = null
          setActiveCandleTime(null)
        }
        return
      }

      const timestampMs = resolveChartEventTime(param.time)
      if (timestampMs === null) {
        hideTooltip()
        return
      }

      const candle = runtime.candleByTimestamp.get(Math.floor(timestampMs / 1000))
      if (!candle) {
        hideTooltip()
        return
      }

      if (hoveredCandleTime !== candle.bucketStart) {
        hoveredCandleTime = candle.bucketStart
        setActiveCandleTime(candle.bucketStart)
      }

      if (!tooltipEl) return
      const { baseSymbol: currentBaseSymbol, quoteSymbol: currentQuoteSymbol, quoteUsd } = chartDisplayRef.current
      const currentPairPrice = `${formatAxisPrice(candle.close)} ${currentQuoteSymbol}`.trim()
      const currentUsd = formatChartUsdPerBase(candle.close, quoteUsd, currentBaseSymbol)
      const openPair = `${formatAxisPrice(candle.open)} ${currentQuoteSymbol}`.trim()
      const highPair = `${formatAxisPrice(candle.high)} ${currentQuoteSymbol}`.trim()
      const lowPair = `${formatAxisPrice(candle.low)} ${currentQuoteSymbol}`.trim()
      const closePair = `${formatAxisPrice(candle.close)} ${currentQuoteSymbol}`.trim()
      const intrabarChange = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : undefined
      const changeClass =
        intrabarChange === undefined
          ? styles.chartTooltipChangeFlat
          : intrabarChange >= 0
            ? styles.chartTooltipChangeUp
            : styles.chartTooltipChangeDown

      tooltipEl.innerHTML = `
        <div class="${styles.chartTooltipTime}">${formatChartTime(candle.bucketStart, timeframe)}</div>
        <div class="${styles.chartTooltipPrice}">${currentPairPrice}</div>
        <div class="${styles.chartTooltipSubprice}">${currentUsd}</div>
        <div class="${styles.chartTooltipMeta}">
          <span class="${styles.chartTooltipChange} ${changeClass}">${
            intrabarChange === undefined ? "--" : formatPercent(intrabarChange)
          }</span>
          <span class="${styles.chartTooltipMetaLabel}">vs open</span>
        </div>
        <div class="${styles.chartTooltipDivider}"></div>
        <div class="${styles.chartTooltipRow}">
          <span>Open</span><strong>${openPair}</strong>
        </div>
        <div class="${styles.chartTooltipRow}">
          <span>High</span><strong>${highPair}</strong>
        </div>
        <div class="${styles.chartTooltipRow}">
          <span>Low</span><strong>${lowPair}</strong>
        </div>
        <div class="${styles.chartTooltipRow}">
          <span>Close</span><strong>${closePair}</strong>
        </div>
        <div class="${styles.chartTooltipRow}">
          <span>Vol</span><strong>${candle.volumeKnown === false ? "--" : formatNumber(candle.volumeQuote, 2)} ${currentQuoteSymbol}</strong>
        </div>
      `

      const tooltipWidth = tooltipEl.offsetWidth || 216
      const tooltipHeight = tooltipEl.offsetHeight || 204
      const left = Math.min(Math.max(param.point.x + 14, 10), host.clientWidth - tooltipWidth - 10)
      const top = Math.min(Math.max(param.point.y - tooltipHeight - 14, 10), host.clientHeight - tooltipHeight - 10)

      tooltipEl.style.left = `${left}px`
      tooltipEl.style.top = `${top}px`
      tooltipEl.style.opacity = "1"
      tooltipEl.style.transform = "translateY(0)"
    }

    chart.subscribeCrosshairMove(handleCrosshairMove)

    chart.timeScale().fitContent()

    // Adapt the visible history to a changed viewport, but never reset zoom on a data refresh.
    let chartWidth = host.clientWidth
    let resizeFrame = 0
    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      if (Math.abs(width - chartWidth) < 1) return
      chartWidth = width
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => chart.timeScale().fitContent())
    })
    resizeObserver.observe(host)

    cleanupChart = () => {
      hideTooltip()
      resizeObserver.disconnect()
      cancelAnimationFrame(resizeFrame)
      themeObserver.disconnect()
      if (chartRuntimeRef.current === runtime) chartRuntimeRef.current = null
      try {
        chart.unsubscribeCrosshairMove(handleCrosshairMove)
      } catch {
        // ignore chart teardown race during route changes
      }
      try {
        chart.remove()
      } catch {
        // ignore chart teardown race during route changes
      }
    }
    })()

    return () => {
      cancelled = true
      cleanupChart?.()
    }
  }, [chartPairId, hasCandles, timeframe])

  const loading = isPairsLoading || isPoolsLoading

  if (loading) {
    return (
      <PageShell title="Pair details" backTo={fallbackBackTo}>
        <section className={`card ${styles.empty}`}>Loading pair details...</section>
      </PageShell>
    )
  }

  if (!detail) {
    return (
      <PageShell title="Pair details" backTo={fallbackBackTo}>
        <section className={`card ${styles.empty}`}>
          Pair data is unavailable. Go back to Market and choose another pair.
        </section>
      </PageShell>
    )
  }

  const { dexName, dexVersion } = splitDexLabel(detail.pool.dexLabel)
  const timeframeValue = chartStats?.change ?? detail.changes[timeframe]
  const timeframeVolumeUsd = detail.volumesUsd[timeframe]
  const timeframeTradersCount = tradersByTimeframe[timeframe]
  const chartPairLabel = `${detail.left.symbol}/${detail.right.symbol}`
  const candleTimeLabel = activeCandle ? formatChartTime(activeCandle.bucketStart, timeframe) : chartPairLabel
  const detailAddressItems = [
    {
      key: "pool",
      label: "Pool address",
      value: detail.pool.pair,
      displayValue: truncateHash(detail.pool.pair, 10, 8),
      copyLabel: "address"
    },
    buildDetailCopyItem("base", detail.left),
    buildDetailCopyItem("quote", detail.right)
  ]
  const provenanceRows = [detail.left, detail.right].flatMap((asset) => {
    const label = getAssetProvenanceLabel(asset)
    if (!label) return []
    return [{
      key: asset.id,
      symbol: asset.symbol,
      label,
      issuer: asset.issuer
    }]
  })
  const handleCopyDetailAddress = (key: string, value: string) => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopiedAddressKey(key)
        window.setTimeout(() => setCopiedAddressKey(""), 1600)
      })
      .catch(() => undefined)
  }

  return (
    <PageShell
      title="Market"
      className={styles.detailPage}
      onBack={handleBack}
      backLabel="Back to market"
    >
      <section className={styles.hero} aria-label="Pair overview">
        <div className={styles.heroTop}>
          <div className={styles.heroLeft}>
            <div className={styles.pairIcons}>
              <span className={styles.pairIconPrimary}>
                <MarketPairAssetIcon
                  key={detail.left.id}
                  symbol={detail.left.symbol}
                  candidates={detail.left.iconCandidates}
                  priority
                  size={32}
                />
              </span>
              <span className={styles.pairIconSecondary}>
                <MarketPairAssetIcon
                  key={detail.right.id}
                  symbol={detail.right.symbol}
                  candidates={detail.right.iconCandidates}
                  priority
                  size={22}
                />
              </span>
            </div>
            <div className={styles.heroHeading}>
              <h2 className={styles.pairTitle}>
                {detail.left.symbol}
                <span>/</span>
                {detail.right.symbol}
              </h2>
              <div className={styles.tags}>
                <span className={styles.dexTag}>{dexName}</span>
                {dexVersion ? <span className={styles.dexVersionTag}>{dexVersion}</span> : null}
                {provenanceRows.map((item) => (
                  <span
                    key={item.key}
                    className={styles.provenanceTag}
                    title={item.issuer ? `${item.label}, issued by ${item.issuer}` : item.label}
                  >
                    {item.symbol}: {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.priceMain}>
              {detailPriceValue !== undefined
                ? formatNumberNoRoundByNonZeroFractionDigits(detailPriceValue, 4)
                : "--"}
              <span className={styles.priceUnit}>{detail.priceQuote.symbol}</span>
            </div>
            <div
              className={`${styles.priceChange} ${
                timeframeValue === undefined
                  ? styles.changeFlat
                  : timeframeValue >= 0
                    ? styles.changeUp
                    : styles.changeDown
              }`}
            >
              {timeframeValue === undefined ? "--" : formatPercent(timeframeValue)}
              <span>{timeframe}</span>
            </div>
            <div className={styles.priceHint}>
              {detail.priceUsd !== undefined
                ? `${formatUsdNoRound(detail.priceUsd)} per ${detail.priceBase.symbol}`
                : "USD price unavailable"}
            </div>
          </div>
        </div>
        <dl className={styles.heroMeta} aria-label="Market statistics" tabIndex={0}>
          {[
            ["Liquidity", detail.liquidityUsd !== undefined ? formatUsdCompact(detail.liquidityUsd) : "--"],
            [`${timeframe} Volume`, timeframeVolumeUsd !== undefined ? formatUsdCompact(timeframeVolumeUsd) : "--"],
            [`${timeframe} Traders`, timeframeTradersCount ?? "--"],
            ["Market cap", formatUsdCompact(detailMarketCapUsd)],
            ["FDV", formatUsdCompact(detailFdvUsd)]
          ].map(([label, value]) => (
            <div className={styles.heroMetaItem} key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className={styles.marketLayout}>
        <MarketPairChartPanel
          activeCandle={activeCandle}
          candleTimeLabel={candleTimeLabel}
          chartHostRef={chartHostRef}
          chartPairLabel={chartPairLabel}
          chartTooltipRef={chartTooltipRef}
          hasCandles={candles.length > 0}
          isCandlesEnabled={Boolean(detail.pool.pair && detailPriceValue)}
          isCandlesError={isCandlesError}
          isCandlesLoading={isCandlesLoading}
          onRetryCandles={() => { void refetchCandles() }}
          onTimeframeChange={setTimeframe}
          onResetView={() => {
            chartRuntimeRef.current?.chart.timeScale().fitContent()
            chartRuntimeRef.current?.priceSeries.priceScale().applyOptions({ autoScale: true })
          }}
          quoteSymbol={detail.right.symbol}
          timeframe={timeframe}
        />

        <aside className={styles.marketRight}>
          <section className={styles.swapEmbed}>
            {!chain.features.swap ? (
              <div className={`card ${styles.tradingUnavailable}`}>
                <strong>Trading is not available on {chain.name} yet</strong>
                <span>Pool data, price history, and recent transactions remain live.</span>
              </div>
            ) : (
              <>
            <div
              className={`${styles.sidePanelTabs} ${
                isBondingCurve ? styles.sidePanelTabsSingle : ""
              }`}
            >
              {(isBondingCurve
                ? (["swap"] as SidePanelMode[])
                : (["swap", "add", "remove"] as SidePanelMode[])
              ).map((item) => (
                <button
                  key={item}
                  className={
                    sidePanelMode === item ? styles.sidePanelTabActive : ""
                  }
                  type="button"
                  aria-pressed={sidePanelMode === item}
                  onClick={() => setSidePanelMode(item)}
                >
                  {item === "swap" ? "Swap" : item === "add" ? "Add" : "Remove"}
                </button>
              ))}
            </div>
            {sidePanelMode === "swap" && isBondingCurve ? (
              <BondingCurveSwapPanel
                assets={[
                  {
                    id: detail.left.id,
                    symbol: detail.left.symbol,
                    name: detail.left.name,
                    decimals: detail.left.decimals,
                    iconCandidates: detail.left.iconCandidates
                  },
                  {
                    id: detail.right.id,
                    symbol: detail.right.symbol,
                    name: detail.right.name,
                    decimals: detail.right.decimals,
                    iconCandidates: detail.right.iconCandidates
                  }
                ]}
                bonding={detail.pool.bonding}
                dexId={detail.pool.dexId}
                dexLabel={detail.pool.dexLabel}
                pairAddress={detail.pool.pair}
              />
            ) : sidePanelMode === "swap" ? (
              <SwapPanel
                key={`${detail.left.id}:${detail.right.id}`}
                embedded
                defaultFromAssetId={detail.left.id}
                defaultToAssetId={detail.right.id}
                pairOnly={{
                  dexId: detail.pool.dexId,
                  dexLabel: detail.pool.dexLabel,
                  pairAddress: detail.pool.pair
                }}
                assetOverrides={[
                  {
                    id: detail.left.id,
                    symbol: detail.left.symbol,
                    name: detail.left.name,
                    decimals: detail.left.decimals,
                    iconCandidates: detail.left.iconCandidates
                  },
                  {
                    id: detail.right.id,
                    symbol: detail.right.symbol,
                    name: detail.right.name,
                    decimals: detail.right.decimals,
                    iconCandidates: detail.right.iconCandidates
                  }
                ]}
              />
            ) : (
              <MarketLiquidityPanel
                assets={[
                  {
                    id: detail.left.id,
                    symbol: detail.left.symbol,
                    name: detail.left.name,
                    decimals: detail.left.decimals,
                    iconCandidates: detail.left.iconCandidates
                  },
                  {
                    id: detail.right.id,
                    symbol: detail.right.symbol,
                    name: detail.right.name,
                    decimals: detail.right.decimals,
                    iconCandidates: detail.right.iconCandidates
                  }
                ]}
                dexId={detail.pool.dexId}
                dexLabel={detail.pool.dexLabel}
                mode={sidePanelMode === "add" ? "provide" : "withdraw"}
                pairAddress={detail.pool.pair}
                poolAssets={detail.pool.poolAssets}
                tokenAddress={liquidityTokenAsset?.id.slice("cw20:".length)}
                tokenDecimals={liquidityTokenAsset?.decimals}
                tokenIconCandidates={liquidityTokenAsset?.iconCandidates}
                tokenSymbol={liquidityTokenAsset?.symbol}
              />
            )}
              </>
            )}
          </section>
        </aside>

        <MarketRecentTrades
          baseSymbol={detail.left.symbol}
          hasMoreTrades={hasMoreTrades}
          isTradesLoading={isTradesLoading}
          onLoadMore={() =>
            setTradePager((prev) => ({
              pair: detail.pool.pair,
              limit: prev.pair === detail.pool.pair ? prev.limit + 25 : 50
            }))
          }
          priceQuoteSymbol={detail.priceQuote.symbol}
          priceQuoteUsd={detailQuoteUsd}
          trades={trades}
        />
        <details className={styles.poolDetails}>
          <summary>
            <strong>Pool details</strong>
            <span>Reserves and contract addresses</span>
          </summary>
          <div className={styles.poolDetailsBody}>
            <div className={styles.heroInfoRow}>
              <span className={styles.heroInfoItem}>
                <em>Reserves</em>
                <strong className={styles.reserveValue}>
                  {formatNumber(detail.leftAmount, 2)} {detail.left.symbol} · {formatNumber(detail.rightAmount, 2)} {detail.right.symbol}
                </strong>
              </span>
              <a className={styles.poolLink} href={getAddressExplorerUrl(chainKey, detail.pool.pair)} target="_blank" rel="noreferrer">
                View pool in explorer
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6" />
                </svg>
              </a>
            </div>
            <div className={styles.heroAddressRow}>
              {detailAddressItems.map((item) => (
                <button key={item.key} className={styles.heroAddressButton} type="button"
                  onClick={() => handleCopyDetailAddress(item.key, item.value)} title={`Copy ${item.copyLabel}: ${item.value}`}>
                  <em>{item.label}</em>
                  <strong>{item.displayValue}</strong>
                  <span>{copiedAddressKey === item.key ? "Copied" : "Copy"}</span>
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
    </PageShell>
  )
}

export default MarketPairDetails
