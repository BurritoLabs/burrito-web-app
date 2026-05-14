import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { MouseEventHandler, Time, UTCTimestamp } from "lightweight-charts"
import PageShell from "./PageShell"
import SwapPanel from "./components/SwapPanel"
import styles from "./MarketPairDetails.module.css"
import { fetchPrices } from "../app/data/classic"
import { fetchCirculatingSnapshot } from "../app/data/dashboard"
import {
  type PairCandle,
  fetchPairCandles,
  fetchPairTrades,
  fetchMarketDexPairs,
  fetchMarketPoolLive,
  fetchMarketPools
} from "../app/data/market"
import {
  useResolvedNativeWhitelist,
  useResolvedIbcWhitelist,
  useResolvedCw20Whitelist
} from "../app/data/terraAssets"
import { useDexEstimatedPrices } from "../app/data/dexPrices"
import {
  formatNumber,
  formatNumberNoRoundByNonZeroFractionDigits,
  formatPercent,
  formatUsd,
  truncateHash,
  toUnitAmount
} from "../app/utils/format"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates,
  buildIbcAssetIconCandidates
} from "../app/utils/assetIcons"

type Timeframe = "1h" | "24h" | "7d"

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

const TIMEFRAME_BUCKET_MS: Record<Timeframe, number> = {
  "1h": 60 * 1000,
  "24h": 30 * 60 * 1000,
  "7d": 2 * 60 * 60 * 1000
}

const TIMEFRAME_LOOKBACK_BUCKETS: Record<Timeframe, number> = {
  "1h": 60,
  "24h": 48,
  "7d": 84
}

const MIN_CANDLES_FOR_CHART: Record<Timeframe, number> = {
  "1h": 20,
  "24h": 12,
  "7d": 18
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
}

const normalizeAssetKey = (key: string) => {
  if (!key) return key
  if (key.startsWith("terra1")) return key.toLowerCase()
  if (key.startsWith("ibc/")) return `ibc/${key.slice(4).toUpperCase()}`
  return key.toLowerCase()
}

const formatNativeSymbol = (denom: string) => {
  if (!denom) return ""
  if (denom === "uluna") return "LUNC"
  if (denom === "uusd") return "USTC"
  if (denom.startsWith("u")) {
    const f = denom.slice(1)
    if (f.length === 3) return `${f.slice(0, 2).toUpperCase()}TC`
    return f.toUpperCase()
  }
  return denom.toUpperCase()
}

const toPairFallbackAsset = (assetId: string) => {
  if (assetId.startsWith("native:")) return assetId.slice("native:".length)
  if (assetId.startsWith("cw20:")) return assetId.slice("cw20:".length)
  return assetId
}

const buildNativeIconCandidates = (denom: string, symbol: string) =>
  buildClassicNativeIconCandidates({ denom, symbol })

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

const formatUsdCompact = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""

  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000, suffix: "t" },
    { threshold: 1_000_000_000, suffix: "b" },
    { threshold: 1_000_000, suffix: "m" },
    { threshold: 1_000, suffix: "k" }
  ]

  for (const unit of units) {
    if (abs >= unit.threshold) {
      const scaled = abs / unit.threshold
      const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
      return `${sign}$${formatNumber(scaled, decimals)}${unit.suffix}`
    }
  }

  const decimals = abs >= 1 ? 2 : 4
  return `${sign}$${formatNumber(abs, decimals)}`
}

const splitDexLabel = (label: string) => {
  const trimmed = label.trim()
  const match = trimmed.match(/^(.*?)(?:\s+(V\d+|XYK))$/i)
  if (!match) return { dexName: trimmed, dexVersion: "" }
  return {
    dexName: match[1].trim(),
    dexVersion: match[2].toUpperCase()
  }
}

const formatUsdNoRound = (value: number) => {
  return `$${formatNumberNoRoundByNonZeroFractionDigits(value, 4)}`
}

const formatAxisPrice = (value: number) => {
  return formatNumberNoRoundByNonZeroFractionDigits(value, 6)
}

const formatChartAxisPrice = (value: number) => {
  if (!Number.isFinite(value)) return String(value)

  const abs = Math.abs(value)
  if (abs >= 1_000) return formatNumber(value, 0)
  if (abs >= 1) return formatNumberNoRoundByNonZeroFractionDigits(value, 2, 8)
  if (abs >= 0.01) return formatNumberNoRoundByNonZeroFractionDigits(value, 3, 8)
  return formatNumberNoRoundByNonZeroFractionDigits(value, 2, 10)
}

const formatChartAxisUsd = (value: number, quoteUsd?: number) => {
  if (quoteUsd === undefined) return formatChartAxisPrice(value)
  const usdValue = value * quoteUsd
  if (!Number.isFinite(usdValue)) return String(usdValue)

  const sign = usdValue < 0 ? "-" : ""
  const abs = Math.abs(usdValue)
  const body =
    abs >= 1_000
      ? formatNumber(abs, 0)
      : abs >= 1
        ? formatNumberNoRoundByNonZeroFractionDigits(abs, 2, 8)
        : abs >= 0.01
          ? formatNumberNoRoundByNonZeroFractionDigits(abs, 3, 8)
          : formatNumberNoRoundByNonZeroFractionDigits(abs, 2, 10)

  return `${sign}$${body}`
}

const formatChartDetailUsd = (value: number) => {
  if (!Number.isFinite(value)) return String(value)
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  return `${sign}$${formatNumberNoRoundByNonZeroFractionDigits(abs, 4, 12)}`
}

const formatChartUsdPerBase = (value: number, quoteUsd?: number, baseSymbol?: string) => {
  if (quoteUsd === undefined) return "--"
  const formatted = formatChartDetailUsd(value * quoteUsd)
  if (!baseSymbol) return formatted
  return `≈ ${formatted} per ${baseSymbol}`
}

const formatTradeTime = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp))

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const formatChartTime = (timestampMs: number, tf: Timeframe) =>
  new Intl.DateTimeFormat("en-US", {
    month: tf === "1h" ? undefined : "short",
    day: tf === "1h" ? undefined : "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestampMs))

const formatChartTickTime = (
  timestampSeconds: number,
  tf: Timeframe,
  tickMarkType: number,
  tickMarkTypeEnum: {
    DayOfMonth: number
    Month: number
    Year: number
  }
) => {
  const date = new Date(timestampSeconds * 1000)
  if (Number.isNaN(date.getTime())) return ""

  const month = MONTH_SHORT[date.getMonth()] ?? ""
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  if (tf === "1h") return `${hours}:${minutes}`

  if (tf === "24h") {
    if (
      tickMarkType === tickMarkTypeEnum.DayOfMonth ||
      tickMarkType === tickMarkTypeEnum.Month ||
      tickMarkType === tickMarkTypeEnum.Year
    ) {
      return `${month} ${day}`
    }
    return `${hours}:${minutes}`
  }

  if (tickMarkType === tickMarkTypeEnum.Year) {
    return `${month} ${day}, ${date.getFullYear()}`
  }

  return `${month} ${day}`
}

const resolveChartEventTime = (time: Time): number | null => {
  if (typeof time === "number") return time * 1000
  if (typeof time === "string") {
    const parsed = Date.parse(time)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parsed = Date.UTC(time.year, time.month - 1, time.day)
  return Number.isFinite(parsed) ? parsed : null
}

const formatTradePrice = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  return formatNumberNoRoundByNonZeroFractionDigits(value, 5)
}

const formatTradeAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  return formatNumberNoRoundByNonZeroFractionDigits(value, 4)
}

const AssetIcon = ({
  symbol,
  candidates,
  size
}: {
  symbol: string
  candidates: string[]
  size: number
}) => {
  const candidateKey = `${symbol}:${candidates.join("|")}`
  return <AssetIconInner key={candidateKey} symbol={symbol} candidates={candidates} size={size} />
}

const AssetIconInner = ({
  symbol,
  candidates,
  size
}: {
  symbol: string
  candidates: string[]
  size: number
}) => {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = candidates[index]

  const fallback = (
    <span
      aria-hidden="true"
      className={styles.assetIconFallback}
      style={{ inset: 0, position: "absolute", width: "100%", height: "100%" }}
    />
  )

  return (
    <span
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-flex",
        flex: "0 0 auto"
      }}
    >
      {fallback}
      {!failed && src ? (
        <img
          src={src}
          alt={symbol}
          width={size}
          height={size}
          decoding="async"
          style={{
            inset: 0,
            position: "absolute",
            opacity: loaded ? 1 : 0,
            transition: "opacity 120ms ease"
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            if (index < candidates.length - 1) {
              setIndex((prev) => prev + 1)
            } else {
              setFailed(true)
            }
          }}
        />
      ) : null}
    </span>
  )
}

const MarketPairDetails = () => {
  const params = useParams<{ pairId?: string; dexId?: string; pair?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [timeframe, setTimeframe] = useState<Timeframe>("24h")
  const [tradePager, setTradePager] = useState<{ pair: string; limit: number }>({
    pair: "",
    limit: 25
  })
  const [activeCandleTime, setActiveCandleTime] = useState<number | null>(null)
  const chartHostRef = useRef<HTMLDivElement | null>(null)
  const chartTooltipRef = useRef<HTMLDivElement | null>(null)
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
    queryKey: ["market", "pairs"],
    queryFn: fetchMarketDexPairs,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000
  })

  const { data: pools = [], isLoading: isPoolsLoading } = useQuery({
    queryKey: ["market", "pools", pairs.map((pair) => pair.pair).join(",")],
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
      "pool-live",
      selectedPairForLivePool?.dexId,
      selectedPairForLivePool?.pair
    ],
    queryFn: () => fetchMarketPoolLive(selectedPairForLivePool!),
    enabled: Boolean(selectedPairForLivePool),
    staleTime: 45_000,
    refetchInterval: 90_000
  })

  const displayPool = liveSelectedPool ?? selectedPool

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
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

  const { data: dashboardSnapshot } = useQuery({
    queryKey: ["dashboard", "circulating", "market-pair"],
    queryFn: fetchCirculatingSnapshot,
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
          isUstc: false
        }
      }
      const nativeToken = nativeWhitelist[denom.toLowerCase()]
      const symbol = nativeToken?.symbol ?? formatNativeSymbol(denom)
      return {
        id: assetId,
        key: normalizeAssetKey(denom),
        symbol,
        name: nativeToken?.name ?? symbol,
        decimals: nativeToken?.decimals ?? 6,
        iconCandidates: buildNativeIconCandidates(denom, symbol),
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
      isUstc: false
    }
  }

  const getAssetUsdPrice = (asset: ResolvedAsset) => {
    if (asset.isLunc) return prices?.lunc?.usd
    if (asset.isUstc) return prices?.ustc?.usd
    const upperSymbol = asset.symbol.trim().toUpperCase()
    if (upperSymbol === "LUNC") return prices?.lunc?.usd
    if (upperSymbol === "USTC") return prices?.ustc?.usd
    const estimate = dexEstimatedPrices?.[asset.key]
    if (!estimate) return undefined
    const quoteUsd = estimate.quoteDenom === "uusd" ? prices?.ustc?.usd : prices?.lunc?.usd
    if (quoteUsd === undefined) return undefined
    return estimate.priceInQuote * quoteUsd
  }

  const getAssetChange = (asset: ResolvedAsset, tf: Timeframe) => {
    if (asset.isLunc) {
      if (tf === "1h") return prices?.lunc?.usd_1h_change
      if (tf === "7d") return prices?.lunc?.usd_7d_change
      return prices?.lunc?.usd_24h_change
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
    const priceUsd = priceQuoteUsd !== undefined ? priceValue * priceQuoteUsd : undefined

    const leftUsd = getAssetUsdPrice(left)
    const rightUsd = getAssetUsdPrice(right)
    const leftValue = leftUsd !== undefined ? leftUsd * leftAmount : undefined
    const rightValue = rightUsd !== undefined ? rightUsd * rightAmount : undefined
    const liquidityUsd =
      leftValue !== undefined && rightValue !== undefined
        ? leftValue + rightValue
        : leftValue !== undefined
          ? leftValue * 2
          : rightValue !== undefined
            ? rightValue * 2
            : undefined

    let marketCapUsd: number | undefined
    if (priceBase.isLunc) {
      marketCapUsd =
        prices?.lunc?.usd_market_cap ??
        (prices?.lunc?.usd !== undefined && dashboardSnapshot?.circulatingLunc
          ? prices.lunc.usd * dashboardSnapshot.circulatingLunc
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
      if (baseChange === undefined && quoteChange === undefined) return undefined
      if (baseChange !== undefined && quoteChange !== undefined) {
        return ((1 + baseChange / 100) / (1 + quoteChange / 100) - 1) * 100
      }
      if (baseChange !== undefined) return baseChange
      return quoteChange !== undefined ? -quoteChange : undefined
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
      changes: {
        "1h": getPairChange("1h"),
        "24h": getPairChange("24h"),
        "7d": getPairChange("7d")
      } as Record<Timeframe, number | undefined>
    }
  })()

  const tradesLimit =
    detail?.pool.pair && tradePager.pair === detail.pool.pair ? tradePager.limit : 25

  const { data: tradesData, isLoading: isTradesLoading } = useQuery({
    queryKey: [
      "market",
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
        limit: tradesLimit
      }),
    enabled: Boolean(detail?.pool.pair),
    staleTime: 45_000,
    refetchInterval: 90_000
  })

  const trades = useMemo(() => tradesData?.trades ?? [], [tradesData?.trades])
  const hasMoreTrades = Boolean(tradesData?.hasMore)

  const { data: candlesData = [], isLoading: isCandlesLoading } = useQuery({
    queryKey: [
      "market",
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
        expectedPrice: detail!.priceValue,
        bucketMs: TIMEFRAME_BUCKET_MS[timeframe],
        lookbackBuckets: TIMEFRAME_LOOKBACK_BUCKETS[timeframe],
        maxCandles: TIMEFRAME_LOOKBACK_BUCKETS[timeframe],
        minCandles: MIN_CANDLES_FOR_CHART[timeframe],
        includeLocalFallback: true
      }),
    enabled: Boolean(detail?.pool.pair),
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
            volumeQuote: existing.volumeQuote + candle.volumeQuote
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
  const chartQuoteUsd = detail?.priceQuoteUsd
  const quoteSymbol = detail?.right.symbol ?? ""

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
    if (!chartHostRef.current || !candles.length) return undefined

    const host = chartHostRef.current
    const tooltipEl = chartTooltipRef.current
    const candleByTimestamp = new Map<number, PairCandle>()
    const firstCandle = candles[0]
    const lastCandle = candles[candles.length - 1]
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
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(10, 16, 13, 0.72)" },
        textColor: "rgba(234, 245, 235, 0.64)",
        fontFamily: "Montserrat, sans-serif",
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
        priceFormatter: (value: number) => formatChartAxisUsd(value, chartQuoteUsd)
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
        minMove: 0.00000001,
        formatter: (value: number) => formatChartAxisUsd(value, chartQuoteUsd)
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

    priceSeries.setData(
      candles.map((candle) => {
        const time = Math.floor(candle.bucketStart / 1000) as UTCTimestamp
        const shouldPadFlatCandle = candle.volumeQuote > 0 && candle.high === candle.low
        const minMove = Math.max(Math.abs(candle.close) * 1e-8, 1e-12)
        const high = shouldPadFlatCandle ? candle.high + minMove : candle.high
        const low = shouldPadFlatCandle ? Math.max(candle.low - minMove, 0) : candle.low
        candleByTimestamp.set(Number(time), candle)
        return {
          time,
          open: candle.open,
          high,
          low,
          close: candle.close
        }
      })
    )

    volumeSeries.setData(
      candles.map((candle) => ({
        time: Math.floor(candle.bucketStart / 1000) as UTCTimestamp,
        value: candle.volumeQuote,
        color:
          candle.close >= candle.open
            ? "rgba(101, 228, 48, 0.28)"
            : "rgba(255, 106, 106, 0.28)"
      }))
    )

    priceSeries.createPriceLine({
      price: lastCandle.close,
      color: trendLineSoft,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      axisLabelColor: trendLineColor,
      axisLabelTextColor: "#08110d"
    })
    priceSeries.createPriceLine({
      price: firstCandle.open,
      color: "rgba(234, 245, 235, 0.14)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      lineVisible: true,
      axisLabelVisible: false
    })

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

      const candle = candleByTimestamp.get(Math.floor(timestampMs / 1000))
      if (!candle) {
        hideTooltip()
        return
      }

      if (hoveredCandleTime !== candle.bucketStart) {
        hoveredCandleTime = candle.bucketStart
        setActiveCandleTime(candle.bucketStart)
      }

      if (!tooltipEl) return
      const currentPairPrice = `${formatAxisPrice(candle.close)} ${quoteSymbol}`.trim()
      const currentUsd = formatChartUsdPerBase(candle.close, chartQuoteUsd, baseSymbol)
      const openPair = `${formatAxisPrice(candle.open)} ${quoteSymbol}`.trim()
      const highPair = `${formatAxisPrice(candle.high)} ${quoteSymbol}`.trim()
      const lowPair = `${formatAxisPrice(candle.low)} ${quoteSymbol}`.trim()
      const closePair = `${formatAxisPrice(candle.close)} ${quoteSymbol}`.trim()
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
          <span>Vol</span><strong>${formatNumber(candle.volumeQuote, 2)} ${quoteSymbol}</strong>
        </div>
      `

      const tooltipWidth = 216
      const tooltipHeight = 204
      const left = Math.min(Math.max(param.point.x + 14, 10), host.clientWidth - tooltipWidth - 10)
      const top = Math.min(Math.max(param.point.y - tooltipHeight - 14, 10), host.clientHeight - tooltipHeight - 10)

      tooltipEl.style.left = `${left}px`
      tooltipEl.style.top = `${top}px`
      tooltipEl.style.opacity = "1"
      tooltipEl.style.transform = "translateY(0)"
    }

    chart.subscribeCrosshairMove(handleCrosshairMove)

    chart.timeScale().fitContent()

    cleanupChart = () => {
      hideTooltip()
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
  }, [baseSymbol, candles, chartQuoteUsd, quoteSymbol, timeframe])

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
  const chartPairLabel = `${detail.left.symbol}/${detail.right.symbol}`
  const candleChange =
    activeCandle && activeCandle.open > 0
      ? ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
      : undefined
  const candleTimeLabel = activeCandle ? formatChartTime(activeCandle.bucketStart, timeframe) : chartPairLabel

  return (
    <PageShell
      title={`${detail.left.symbol}/${detail.right.symbol}`}
      onBack={handleBack}
      extra={
        <div className={styles.timeframe}>
          {(["1h", "24h", "7d"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              className={`${styles.timeButton} ${timeframe === tf ? styles.timeButtonActive : ""}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      }
    >
      <section className={`card ${styles.hero}`}>
        <div className={styles.heroTop}>
          <div className={styles.heroLeft}>
            <div className={styles.pairIcons}>
              <span className={styles.pairIconPrimary}>
                <AssetIcon
                  key={detail.left.id}
                  symbol={detail.left.symbol}
                  candidates={detail.left.iconCandidates}
                  size={48}
                />
              </span>
              <span className={styles.pairIconSecondary}>
                <AssetIcon
                  key={detail.right.id}
                  symbol={detail.right.symbol}
                  candidates={detail.right.iconCandidates}
                  size={30}
                />
              </span>
            </div>
            <div className={styles.heroHeading}>
              <div className={styles.pairTitle}>
                {detail.left.symbol}
                <span>/</span>
                {detail.right.symbol}
              </div>
              <div className={styles.tags}>
                <span className={styles.dexTag}>{dexName}</span>
                {dexVersion ? <span className={styles.dexVersionTag}>{dexVersion}</span> : null}
              </div>
            </div>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.priceMain}>
              {detail.priceUsd !== undefined ? formatUsdNoRound(detail.priceUsd) : "--"}
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
              {timeframe}: {timeframeValue === undefined ? "--" : formatPercent(timeframeValue)}
            </div>
            <div className={styles.priceHint}>
              1 {detail.priceBase.symbol} ≈{" "}
              {formatNumberNoRoundByNonZeroFractionDigits(detail.priceValue, 4)}{" "}
              {detail.priceQuote.symbol}
            </div>
          </div>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.heroMetaItem}>
            <em>Mkt Cap</em>
            <strong>{formatUsdCompact(detail.marketCapUsd)}</strong>
          </span>
          <span className={styles.heroMetaItem}>
            <em>Liquidity</em>
            <strong>{detail.liquidityUsd !== undefined ? formatUsd(detail.liquidityUsd) : "--"}</strong>
          </span>
        </div>
        <div className={styles.heroInfoRow}>
          <span className={styles.heroInfoItem}>
            <em>Reserves</em>
            <strong className={styles.reserveValue}>
              {formatNumber(detail.leftAmount, 2)} {detail.left.symbol} · {formatNumber(detail.rightAmount, 2)}{" "}
              {detail.right.symbol}
            </strong>
          </span>
          <span className={styles.heroInfoItem}>
            <em>Pool</em>
            <a
              className={styles.poolLink}
              href={`https://finder.burrito.money/classic/address/${detail.pool.pair}`}
              target="_blank"
              rel="noreferrer"
              title={detail.pool.pair}
            >
              <span className={styles.poolValue}>{truncateHash(detail.pool.pair, 10, 8)}</span>
            </a>
          </span>
        </div>
      </section>

      <div className={styles.marketLayout}>
        <section className={`card ${styles.chartSection}`}>
          <header className={styles.chartHeader}>
            <span className={styles.sectionTitle}>Price chart</span>
            <span className={styles.chartSymbol}>{candleTimeLabel}</span>
          </header>
          <header className={styles.ohlcHeader}>
            {activeCandle ? (
              <>
                <span>O {formatAxisPrice(activeCandle.open)} {detail.right.symbol}</span>
                <span>H {formatAxisPrice(activeCandle.high)} {detail.right.symbol}</span>
                <span>L {formatAxisPrice(activeCandle.low)} {detail.right.symbol}</span>
                <span>C {formatAxisPrice(activeCandle.close)} {detail.right.symbol}</span>
                <span>Vol {formatNumber(activeCandle.volumeQuote, 2)} {detail.right.symbol}</span>
                <span className={styles.ohlcFlat}>
                  {formatChartUsdPerBase(activeCandle.close, chartQuoteUsd, detail.left.symbol)}
                </span>
                <span
                  className={
                    candleChange === undefined
                      ? styles.ohlcFlat
                      : candleChange >= 0
                        ? styles.ohlcUp
                        : styles.ohlcDown
                  }
                >
                  {candleChange === undefined ? "--" : formatPercent(candleChange)}
                </span>
              </>
            ) : (
              <span className={styles.ohlcFlat}>No candle data yet</span>
            )}
          </header>
          {isCandlesLoading && !candles.length ? (
            <div className={styles.chartFallback}>Loading recent swaps...</div>
          ) : !candles.length ? (
            <div className={styles.chartFallback}>
              No recent swaps to build candles for this timeframe.
            </div>
          ) : (
            <div className={styles.chartCanvas}>
              <div
                ref={chartHostRef}
                className={styles.chartHost}
                aria-label={`${chartPairLabel} ${timeframe} price chart`}
              />
              <div ref={chartTooltipRef} className={styles.chartTooltip} />
            </div>
          )}
        </section>

        <aside className={styles.marketRight}>
          <section className={styles.swapEmbed}>
            <SwapPanel
              key={`${detail.left.id}:${detail.right.id}`}
              embedded
              defaultFromAssetId={detail.left.id}
              defaultToAssetId={detail.right.id}
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
          </section>
        </aside>

        <section className={`card ${styles.tradesSection}`}>
          <header className={styles.tradesHeader}>
            <span className={styles.sectionTitle}>Recent trades</span>
            <span className={styles.tradesCount}>{trades.length} shown</span>
          </header>
          {isTradesLoading ? (
            <div className={styles.tradesFallback}>Loading recent swaps...</div>
          ) : !trades.length ? (
            <div className={styles.tradesFallback}>No recent swaps found for this pair.</div>
          ) : (
            <>
              <div className={styles.tradesTableWrap}>
                <table className={styles.tradesTable}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Side</th>
                      <th>Price</th>
                      <th>Amount</th>
                      <th>Trader</th>
                      <th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, index) => {
                      const quotePrice = `${formatTradePrice(trade.price)} ${detail.priceQuote.symbol}`
                      const usdPrice =
                        detail.priceQuoteUsd !== undefined
                          ? formatChartDetailUsd(trade.price * detail.priceQuoteUsd)
                          : undefined

                      return (
                        <tr key={`${trade.txhash}-${trade.timestamp}-${trade.side}-${index}`}>
                          <td>{formatTradeTime(trade.timestamp)}</td>
                          <td>
                            <span
                              className={`${styles.sideBadge} ${
                                trade.side === "buy" ? styles.sideBuy : styles.sideSell
                              }`}
                            >
                              {trade.side}
                            </span>
                          </td>
                          <td>
                            <span className={styles.tradePriceCell}>
                              <span className={styles.tradePricePrimary}>
                                {usdPrice ?? quotePrice}
                              </span>
                              {usdPrice ? (
                                <span className={styles.tradePriceQuote}>≈ {quotePrice}</span>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            {formatTradeAmount(trade.amountBase)} {detail.left.symbol}
                          </td>
                          <td>
                            <a
                              href={`https://finder.burrito.money/classic/address/${trade.trader}`}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.tradesLink}
                            >
                              {truncateHash(trade.trader, 8, 6)}
                            </a>
                          </td>
                          <td>
                            <a
                              href={`https://finder.burrito.money/classic/tx/${trade.txhash}`}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.tradesLink}
                            >
                              {truncateHash(trade.txhash, 8, 6)}
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {hasMoreTrades ? (
                <div className={styles.tradesActions}>
                  <button
                    type="button"
                    className={`uiButton uiButtonOutline ${styles.loadMoreButton}`}
                    onClick={() =>
                      setTradePager((prev) => ({
                        pair: detail.pool.pair,
                        limit: prev.pair === detail.pool.pair ? prev.limit + 25 : 50
                      }))
                    }
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </PageShell>
  )
}

export default MarketPairDetails
