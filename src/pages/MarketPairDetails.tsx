import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type BusinessDay,
  type UTCTimestamp
} from "lightweight-charts"
import PageShell from "./PageShell"
import styles from "./MarketPairDetails.module.css"
import { fetchPrices } from "../app/data/classic"
import { fetchCurrentDashboardSnapshot } from "../app/data/dashboard"
import {
  type PairCandle,
  fetchPairCandles,
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

const TIMEFRAME_BUCKET_MS: Record<Timeframe, number> = {
  "1h": 5 * 60 * 1000,
  "24h": 30 * 60 * 1000,
  "7d": 2 * 60 * 60 * 1000
}

const TIMEFRAME_LOOKBACK_BUCKETS: Record<Timeframe, number> = {
  "1h": 12,
  "24h": 48,
  "7d": 84
}

const MIN_CANDLES_FOR_CHART: Record<Timeframe, number> = {
  "1h": 6,
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
  return formatNumberNoRoundByNonZeroFractionDigits(value, 4)
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
  const [tradesLimit, setTradesLimit] = useState(25)
  const [activeCandleTime, setActiveCandleTime] = useState<number | null>(null)
  const chartHostRef = useRef<HTMLDivElement | null>(null)

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

  const detail = useMemo(() => {
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
  }, [selectedPool, prices, dashboardSnapshot, dexEstimatedPrices, ibcWhitelist, cw20Whitelist])

  useEffect(() => {
    setTradesLimit(25)
  }, [detail?.pool.pair])

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

  const trades = tradesData?.trades ?? []
  const hasMoreTrades = Boolean(tradesData?.hasMore)

  const { data: fallbackCandles = [], isLoading: isFallbackCandlesLoading } = useQuery({
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
    enabled: Boolean(detail?.pool?.pair),
    staleTime: 60_000,
    refetchInterval: 120_000
  })

  const candles = useMemo(() => fallbackCandles, [fallbackCandles])

  const displayCandles = useMemo(() => {
    const quoteUsd = detail?.priceQuoteUsd
    if (!candles.length) return []
    if (!quoteUsd) return candles
    return candles.map((item) => ({
      ...item,
      open: item.open * quoteUsd,
      high: item.high * quoteUsd,
      low: item.low * quoteUsd,
      close: item.close * quoteUsd,
      volumeQuote: item.volumeQuote * quoteUsd
    }))
  }, [candles, detail?.priceQuoteUsd])

  const isCandlesLoading = !displayCandles.length && isFallbackCandlesLoading

  const timeframeChangeFromCandles = useMemo(() => {
    if (displayCandles.length < 2) return undefined
    const first = displayCandles[0]
    const last = displayCandles[displayCandles.length - 1]
    if (!first || !last || first.open <= 0) return undefined
    return ((last.close - first.open) / first.open) * 100
  }, [displayCandles])

  useEffect(() => {
    if (!displayCandles.length || !chartHostRef.current) return

    const chart = createChart(chartHostRef.current, {
      autoSize: true,
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(10, 16, 13, 0.72)" },
        textColor: "rgba(234, 245, 235, 0.65)",
        fontFamily: "Montserrat, sans-serif",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.06)" },
        horzLines: { color: "rgba(255, 255, 255, 0.10)" }
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.32 }
      },
      leftPriceScale: { visible: false },
      crosshair: {
        vertLine: {
          color: "rgba(255, 255, 255, 0.28)",
          width: 1,
          labelBackgroundColor: "rgba(11, 20, 15, 0.95)"
        },
        horzLine: {
          color: "rgba(255, 255, 255, 0.28)",
          width: 1,
          labelBackgroundColor: "rgba(11, 20, 15, 0.95)"
        }
      },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: timeframe === "1h",
        secondsVisible: false
      },
      localization: {
        priceFormatter: (value: number) => formatAxisPrice(value)
      }
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(101, 228, 48, 0.95)",
      downColor: "rgba(255, 106, 106, 0.95)",
      borderVisible: true,
      borderUpColor: "rgba(101, 228, 48, 0.98)",
      borderDownColor: "rgba(255, 106, 106, 0.98)",
      wickUpColor: "rgba(101, 228, 48, 0.98)",
      wickDownColor: "rgba(255, 106, 106, 0.98)",
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        minMove: 0.000000000000000001,
        formatter: (value: number) => formatAxisPrice(value)
      }
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false
    })
    chart.priceScale("").applyOptions({
      visible: false,
      scaleMargins: {
        top: 0.76,
        bottom: 0
      }
    })

    const toTimestamp = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp
    const candleByTimestamp = new Map<number, PairCandle>()

    candleSeries.setData(
      displayCandles.map((candle) => {
        const time = toTimestamp(candle.bucketStart)
        const tiny = Math.max(Math.abs(candle.close) * 1e-8, 1e-12)
        const normalizedHigh =
          candle.high === candle.low ? candle.high + tiny : candle.high
        const normalizedLow =
          candle.high === candle.low ? Math.max(candle.low - tiny, 0) : candle.low
        candleByTimestamp.set(Number(time), candle)
        return {
          time,
          open: candle.open,
          high: normalizedHigh,
          low: normalizedLow,
          close: candle.close
        }
      })
    )

    volumeSeries.setData(
      displayCandles.map((candle) => ({
        time: toTimestamp(candle.bucketStart),
        value: candle.volumeQuote,
        color:
          candle.close >= candle.open
            ? "rgba(101, 228, 48, 0.34)"
            : "rgba(255, 106, 106, 0.34)"
      }))
    )

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setActiveCandleTime(null)
        return
      }

      let timeValue: number
      if (typeof param.time === "number") {
        timeValue = param.time
      } else if (typeof param.time === "string") {
        const parsed = Date.parse(param.time)
        if (!Number.isFinite(parsed)) {
          setActiveCandleTime(null)
          return
        }
        timeValue = Math.floor(parsed / 1000)
      } else {
        const businessDay = param.time as BusinessDay
        timeValue = Math.floor(
          Date.UTC(businessDay.year, businessDay.month - 1, businessDay.day) / 1000
        )
      }

      if (!candleByTimestamp.has(timeValue)) {
        setActiveCandleTime(null)
        return
      }
      setActiveCandleTime(timeValue * 1000)
    })

    chart.timeScale().fitContent()

    return () => {
      setActiveCandleTime(null)
      chart.remove()
    }
  }, [displayCandles, timeframe])

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

  const timeframeValue = timeframeChangeFromCandles ?? detail.changes[timeframe]
  const activeCandle = activeCandleTime
    ? displayCandles.find((candle) => candle.bucketStart === activeCandleTime)
    : undefined
  const chartCandle =
    activeCandle ?? (displayCandles.length ? displayCandles[displayCandles.length - 1] : undefined)
  const chartCandleChange =
    chartCandle && chartCandle.open > 0
      ? ((chartCandle.close - chartCandle.open) / chartCandle.open) * 100
      : undefined
  const chartPairLabel = detail.priceQuoteUsd
    ? `${detail.left.symbol}/USD`
    : `${detail.left.symbol}/${detail.right.symbol}`

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
              <AssetIcon symbol={detail.left.symbol} candidates={detail.left.iconCandidates} size={40} />
            </span>
            <span className={styles.pairIconSecondary}>
              <AssetIcon symbol={detail.right.symbol} candidates={detail.right.iconCandidates} size={24} />
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

      <section className={styles.statsGrid}>
        <article className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Mkt Cap</span>
          <strong className={styles.statValue}>{formatUsdCompact(detail.marketCapUsd)}</strong>
        </article>
        <article className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Liquidity</span>
          <strong className={styles.statValue}>{detail.liquidityUsd !== undefined ? formatUsd(detail.liquidityUsd) : "--"}</strong>
        </article>
        <article className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Pool</span>
          <a
            href={`https://finder.burrito.money/classic/address/${detail.pool.pair}`}
            target="_blank"
            rel="noreferrer"
            className={styles.poolLink}
          >
            {detail.pool.pair.slice(0, 10)}...{detail.pool.pair.slice(-6)}
          </a>
        </article>
      </section>

      <section className={`card ${styles.chartSection}`}>
        <header className={styles.chartHeader}>
          <span className={styles.sectionTitle}>Price chart</span>
          <span className={styles.chartSymbol}>{chartPairLabel}</span>
        </header>
        <header className={styles.ohlcHeader}>
          {chartCandle ? (
            <>
              <span>O {formatAxisPrice(chartCandle.open)}</span>
              <span>H {formatAxisPrice(chartCandle.high)}</span>
              <span>L {formatAxisPrice(chartCandle.low)}</span>
              <span>C {formatAxisPrice(chartCandle.close)}</span>
              <span
                className={
                  chartCandleChange === undefined
                    ? styles.ohlcFlat
                    : chartCandleChange >= 0
                      ? styles.ohlcUp
                      : styles.ohlcDown
                }
              >
                {chartCandleChange === undefined ? "--" : formatPercent(chartCandleChange)}
              </span>
            </>
          ) : (
            <span className={styles.ohlcFlat}>No candle data yet</span>
          )}
        </header>
        {isCandlesLoading ? (
          <div className={styles.chartFallback}>Loading candles from on-chain swaps...</div>
        ) : !displayCandles.length ? (
          <div className={styles.chartFallback}>No recent swaps to build candles for this timeframe.</div>
        ) : (
          <div className={styles.chartCanvas}>
            <div
              ref={chartHostRef}
              className={styles.chartHost}
              aria-label={`${chartPairLabel} ${timeframe} candlestick chart`}
            />
            <div className={styles.chartAttribution}>Chart by TradingView</div>
          </div>
        )}
      </section>

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
                  onClick={() => setTradesLimit((prev) => prev + 25)}
                >
                  Load more
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className={`card ${styles.reserves}`}>
        <header className={styles.sectionTitle}>Reserves</header>
        <div className={styles.reserveGrid}>
          <article className={styles.reserveCard}>
            <div className={styles.reserveAsset}>
              <AssetIcon symbol={detail.left.symbol} candidates={detail.left.iconCandidates} size={26} />
              <span>{detail.left.symbol}</span>
            </div>
            <strong>{formatNumber(detail.leftAmount, 6)}</strong>
          </article>
          <article className={styles.reserveCard}>
            <div className={styles.reserveAsset}>
              <AssetIcon symbol={detail.right.symbol} candidates={detail.right.iconCandidates} size={26} />
              <span>{detail.right.symbol}</span>
            </div>
            <strong>{formatNumber(detail.rightAmount, 6)}</strong>
          </article>
        </div>
      </section>

      <section className={`card ${styles.actions}`}>
        <div className={styles.actionsInfo}>
          Trade this pair with Burrito Swap route aggregation.
        </div>
        <Link className={`uiButton uiButtonPrimary ${styles.tradeButton}`} to="/swap">
          Open swap
        </Link>
      </section>
    </PageShell>
  )
}

export default MarketPairDetails
