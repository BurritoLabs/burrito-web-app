import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import SwapPanel from "./components/SwapPanel"
import styles from "./MarketPairDetails.module.css"
import { fetchPrices } from "../app/data/classic"
import { fetchCurrentDashboardSnapshot } from "../app/data/dashboard"
import {
  fetchPairTrades,
  fetchMarketDexPairs,
  fetchMarketPools,
  getMarketPoolIbcDenoms
} from "../app/data/market"
import { useCw20Whitelist, useResolvedIbcWhitelist } from "../app/data/terraAssets"
import { useDexEstimatedPrices } from "../app/data/dexPrices"
import {
  formatNumber,
  formatNumberNoRoundByNonZeroFractionDigits,
  formatPercent,
  formatUsd,
  truncateHash,
  toUnitAmount
} from "../app/utils/format"

type Timeframe = "1h" | "24h" | "7d"

const TIMEFRAME_LOOKBACK_MS: Record<Timeframe, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
}
const CHART_RECENT_TRADES_LIMIT = 250

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

const ASSET_URL = "https://assets.terra.dev"

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

const buildNativeIconCandidates = (denom: string, symbol: string) => {
  const iconDenom = denom === "uluna" ? "LUNC" : symbol
  const upper = iconDenom.toUpperCase()
  const lower = iconDenom.toLowerCase()
  return [
    `${ASSET_URL}/icon/60/${iconDenom}.png`,
    `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
    `${ASSET_URL}/icon/60/${upper}.png`,
    `${ASSET_URL}/icon/svg/${upper}.svg`,
    `${ASSET_URL}/icon/60/${lower}.png`,
    ...(upper === "USTC"
      ? [`${ASSET_URL}/icon/svg/USTC.svg`, `${ASSET_URL}/icon/60/USTC.png`, "/system/ustc.png"]
      : []),
    ...(upper === "LUNC" ? ["/system/lunc.svg"] : []),
    "/system/cw20.svg"
  ]
}

const buildIbcIconCandidates = ({
  symbol,
  ibcIcon,
  hexxagonIcon
}: {
  symbol: string
  ibcIcon?: string
  hexxagonIcon?: string
}) => {
  const cleanSymbol = symbol.trim()
  return [
    hexxagonIcon,
    ibcIcon,
    cleanSymbol
      ? `https://assets.hexxagon.io/icon/svg/ibc/${encodeURIComponent(cleanSymbol)}.svg`
      : undefined,
    cleanSymbol ? `${ASSET_URL}/icon/svg/${cleanSymbol}.svg` : undefined,
    cleanSymbol ? `${ASSET_URL}/icon/60/${cleanSymbol}.png` : undefined,
    "/system/ibc.svg"
  ].filter(Boolean) as string[]
}

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

const formatTradeTime = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp))

const formatTrendEdgeTime = (timestampMs: number, tf: Timeframe) =>
  new Intl.DateTimeFormat("en-US", {
    month: tf === "1h" ? undefined : "short",
    day: tf === "1h" ? undefined : "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestampMs))

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
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  if (failed || !candidates.length) {
    return (
      <span className={styles.assetIconFallback} style={{ width: size, height: size }}>
        {symbol.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={candidates[index]}
      alt={symbol}
      width={size}
      height={size}
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex((prev) => prev + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

const MarketPairDetails = () => {
  const params = useParams<{ pairId?: string; dexId?: string; pair?: string }>()
  const [timeframe, setTimeframe] = useState<Timeframe>("24h")
  const [tradePager, setTradePager] = useState<{ pair: string; limit: number }>({
    pair: "",
    limit: 25
  })

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

  const ibcDenoms = useMemo(() => {
    const set = new Set<string>(getMarketPoolIbcDenoms(pairs))
    pools.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id.startsWith("native:ibc/")) return
        set.add(asset.id.slice("native:".length))
      })
    })
    return Array.from(set)
  }, [pairs, pools])

  const { data: ibcWhitelist = {} } = useResolvedIbcWhitelist(ibcDenoms)
  const { data: cw20Whitelist = {} } = useCw20Whitelist()

  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

  const { data: dashboardSnapshot } = useQuery({
    queryKey: ["dashboard", "snapshot", "market-pair"],
    queryFn: fetchCurrentDashboardSnapshot,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000
  })

  const assetMetas = useMemo(() => {
    const map = new Map<string, number>()
    pools.forEach((pool) => {
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
            : 6
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
  }, [cw20Whitelist, ibcWhitelist, pools])

  const { data: dexEstimatedPrices } = useDexEstimatedPrices(assetMetas)

  const selectedPool = useMemo(() => {
    if (!decodedPairId) return undefined
    const lowerPairId = decodedPairId.toLowerCase()
    return pools.find((pool) => `${pool.dexId}:${pool.pair}`.toLowerCase() === lowerPairId)
  }, [decodedPairId, pools])

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
            symbol,
            ibcIcon: ibc?.icon,
            hexxagonIcon: ibcHexxagon?.icon
          }),
          isLunc: false,
          isUstc: false
        }
      }
      const symbol = formatNativeSymbol(denom)
      return {
        id: assetId,
        key: normalizeAssetKey(denom),
        symbol,
        name: symbol,
        decimals: 6,
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
      iconCandidates: [token?.icon, "/system/cw20.svg"].filter(Boolean) as string[],
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
    if (!selectedPool) return undefined

    let left = resolveAsset(selectedPool.poolAssets[0].id)
    let right = resolveAsset(selectedPool.poolAssets[1].id)
    let leftAmount = toUnitAmount(selectedPool.poolAssets[0].amount, left.decimals)
    let rightAmount = toUnitAmount(selectedPool.poolAssets[1].amount, right.decimals)

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
      pool: selectedPool,
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

  const {
    data: tradesData,
    isLoading: isTradesLoading,
    dataUpdatedAt: tradesUpdatedAt
  } = useQuery({
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

  const {
    data: chartTradesData,
    isLoading: isChartTradesLoading,
    dataUpdatedAt: chartTradesUpdatedAt
  } = useQuery({
    queryKey: [
      "market",
      "pair-trades-chart",
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
        limit: CHART_RECENT_TRADES_LIMIT
      }),
    enabled: Boolean(detail?.pool.pair),
    staleTime: 30_000,
    refetchInterval: 60_000
  })

  const chartPoints = useMemo(() => {
    if (!detail) return [] as Array<{ time: number; value: number }>
    const lookbackMs = TIMEFRAME_LOOKBACK_MS[timeframe]
    const referenceNow = Math.max(chartTradesUpdatedAt, tradesUpdatedAt, 0)
    const cutoff = referenceNow > 0 ? referenceNow - lookbackMs : 0
    const chartTrades = chartTradesData?.trades ?? trades

    const sortedAll = [...chartTrades]
      .sort((a, b) => a.timestamp - b.timestamp)

    const inRange = sortedAll.filter((trade) => trade.timestamp >= cutoff)
    const source = inRange.length >= 2 ? inRange : sortedAll.slice(-80)

    return source
      .map((trade) => ({
        time: trade.timestamp,
        // Keep chart and trade table in the same price basis (left/right pair price).
        value: trade.price
      }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0)
  }, [detail, timeframe, trades, tradesUpdatedAt, chartTradesData, chartTradesUpdatedAt])

  const trendGeometry = useMemo(() => {
    if (!chartPoints.length) return undefined

    const width = 1000
    const height = 320
    const padX = 14
    const padY = 16
    const usableW = width - padX * 2
    const usableH = height - padY * 2

    const rawMin = Math.min(...chartPoints.map((point) => point.value))
    const rawMax = Math.max(...chartPoints.map((point) => point.value))
    const rawSpan = rawMax - rawMin
    const spanPad = rawSpan > 0 ? rawSpan * 0.08 : Math.max(Math.abs(rawMax) * 0.02, 1e-8)
    const minValue = Math.max(rawMin - spanPad, 0)
    const maxValue = rawMax + spanPad
    const valueSpan = Math.max(maxValue - minValue, 1e-12)

    // Keep x positions evenly distributed so the simple trend never renders blank.
    const divisor = Math.max(chartPoints.length - 1, 1)
    const points = chartPoints.map((point, index) => {
      const x = padX + (index / divisor) * usableW
      const y = padY + (1 - (point.value - minValue) / valueSpan) * usableH
      return { x, y }
    })

    const renderPoints = points.length === 1
      ? [
          points[0],
          { x: padX + usableW, y: points[0].y }
        ]
      : points

    const linePath = renderPoints
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      )
      .join(" ")

    const areaPath = `${linePath} L ${(padX + usableW).toFixed(2)} ${(padY + usableH).toFixed(
      2
    )} L ${padX.toFixed(2)} ${(padY + usableH).toFixed(2)} Z`

    return {
      width,
      height,
      padX,
      padY,
      usableW,
      usableH,
      minTime: chartPoints[0].time,
      maxTime: chartPoints[chartPoints.length - 1].time,
      linePath,
      areaPath,
      points: renderPoints
    }
  }, [chartPoints])

  const chartStats = useMemo(() => {
    if (!chartPoints.length) return undefined
    const first = chartPoints[0].value
    const last = chartPoints[chartPoints.length - 1].value
    const high = Math.max(...chartPoints.map((point) => point.value))
    const low = Math.min(...chartPoints.map((point) => point.value))
    return {
      start: first,
      last,
      high,
      low,
      change: first > 0 ? ((last - first) / first) * 100 : undefined
    }
  }, [chartPoints])

  const loading = isPairsLoading || isPoolsLoading

  if (loading) {
    return (
      <PageShell title="Pair details" backTo="/market">
        <section className={`card ${styles.empty}`}>Loading pair details...</section>
      </PageShell>
    )
  }

  if (!detail) {
    return (
      <PageShell title="Pair details" backTo="/market">
        <section className={`card ${styles.empty}`}>
          Pair data is unavailable. Go back to Market and choose another pair.
        </section>
      </PageShell>
    )
  }

  const { dexName, dexVersion } = splitDexLabel(detail.pool.dexLabel)

  const timeframeValue = chartStats?.change ?? detail.changes[timeframe]
  const chartPairLabel = `${detail.left.symbol}/${detail.right.symbol}`

  return (
    <PageShell
      title={`${detail.left.symbol}/${detail.right.symbol}`}
      backTo="/market"
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
          <div>
            <div className={styles.pairTitle}>
              {detail.left.symbol}
              <span>/</span>
              {detail.right.symbol}
            </div>
            <div className={styles.tags}>
              <span className={styles.dexTag}>{dexName}</span>
              {dexVersion ? <span className={styles.dexVersionTag}>{dexVersion}</span> : null}
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
              <span className={styles.heroMetaItem}>
                <em>Reserves</em>
                <strong className={styles.reserveValue}>
                  {formatNumber(detail.leftAmount, 2)} {detail.left.symbol} · {formatNumber(detail.rightAmount, 2)}{" "}
                  {detail.right.symbol}
                </strong>
              </span>
              <span className={styles.heroMetaItem}>
                <em>Pool</em>
                <strong className={styles.poolValue}>{truncateHash(detail.pool.pair, 10, 8)}</strong>
              </span>
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
      </section>

      <div className={styles.marketLayout}>
        <section className={`card ${styles.chartSection}`}>
          <header className={styles.chartHeader}>
            <span className={styles.sectionTitle}>Price chart</span>
            <span className={styles.chartSymbol}>{chartPairLabel}</span>
          </header>
          <header className={styles.ohlcHeader}>
            {chartStats ? (
              <>
                <span>Start {formatAxisPrice(chartStats.start)}</span>
                <span>High {formatAxisPrice(chartStats.high)}</span>
                <span>Low {formatAxisPrice(chartStats.low)}</span>
                <span>Last {formatAxisPrice(chartStats.last)}</span>
                <span
                  className={
                    chartStats.change === undefined
                      ? styles.ohlcFlat
                      : chartStats.change >= 0
                        ? styles.ohlcUp
                        : styles.ohlcDown
                  }
                >
                  {chartStats.change === undefined ? "--" : formatPercent(chartStats.change)}
                </span>
              </>
            ) : (
              <span className={styles.ohlcFlat}>No trade data yet</span>
            )}
          </header>
          {(isTradesLoading || isChartTradesLoading) && !chartPoints.length ? (
            <div className={styles.chartFallback}>Loading recent swaps...</div>
          ) : !chartPoints.length ? (
            <div className={styles.chartFallback}>
              No recent swaps to draw trend in this timeframe.
            </div>
          ) : (
            <div className={styles.chartCanvas}>
              {trendGeometry ? (
                <>
                  <svg
                    className={styles.trendSvg}
                    viewBox={`0 0 ${trendGeometry.width} ${trendGeometry.height}`}
                    preserveAspectRatio="none"
                    aria-label={`${chartPairLabel} ${timeframe} price trend chart`}
                  >
                    {[0, 1, 2, 3, 4].map((row) => {
                      const y = trendGeometry.padY + (trendGeometry.usableH / 4) * row
                      return (
                        <line
                          key={`grid-${row}`}
                          x1={trendGeometry.padX}
                          x2={trendGeometry.padX + trendGeometry.usableW}
                          y1={y}
                          y2={y}
                          className={styles.trendGrid}
                        />
                      )
                    })}
                    <path d={trendGeometry.areaPath} className={styles.trendArea} />
                    <path d={trendGeometry.linePath} className={styles.trendLine} />
                    {trendGeometry.points.map((point, index) => (
                      <circle
                        key={`trend-point-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={index === trendGeometry.points.length - 1 ? 3.6 : 2.2}
                        className={styles.trendPoint}
                      />
                    ))}
                  </svg>
                  <div className={styles.trendEdgeTimes}>
                    <span>{formatTrendEdgeTime(trendGeometry.minTime, timeframe)}</span>
                    <span>{formatTrendEdgeTime(trendGeometry.maxTime, timeframe)}</span>
                  </div>
                </>
              ) : null}
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
                    {trades.map((trade) => (
                      <tr key={`${trade.txhash}-${trade.timestamp}-${trade.side}`}>
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
                        <td>{formatTradePrice(trade.price)}</td>
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
                    ))}
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
