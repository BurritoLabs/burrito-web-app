import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../Market.module.css"
import { CLASSIC_CHAIN } from "../../app/chain"
import {
  fetchMarketDexPairs,
  fetchMarketPoolLive,
  fetchMarketPools,
  type MarketPoolSnapshot
} from "../../app/data/market"
import {
  useResolvedNativeWhitelist,
  useResolvedIbcWhitelist,
  useResolvedCw20Whitelist
} from "../../app/data/terraAssets"
import { useCw20Supplies } from "../../app/data/cw20"
import { fetchPrices } from "../../app/data/classic"
import { fetchCirculatingSnapshot } from "../../app/data/dashboard"
import { useDexEstimatedPrices } from "../../app/data/dexPrices"
import { fetchWithEndpointFallback } from "../../app/data/endpointFallback"
import { formatNumber, formatPercent, formatUsd, toUnitAmount } from "../../app/utils/format"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates,
  buildIbcAssetIconCandidates
} from "../../app/utils/assetIcons"
import {
  formatNativeSymbol,
  normalizeAssetKey
} from "../../app/utils/assetIdentity"
import { splitDexLabel } from "../../app/utils/dexDisplay"
import {
  formatUsdCompact,
  numberToPlainString,
  trimFractionByNonZeroDigits
} from "../../app/utils/numberDisplay"
import { deriveUsdPricesFromPools } from "../../app/market/priceGraph"

type SortMetric = "change" | "volume" | "liquidity" | "marketCap"
type SortDirection = "desc" | "asc"
type Timeframe = "1h" | "24h" | "7d"

type NativeSupplyInfo = {
  denom: string
  amount: string
  units: number
  decimals: number
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

type MarketCard = {
  id: string
  pairAddress: string
  pairLabel: string
  dexLabel: string
  dexId: string
  left: ResolvedAsset
  right: ResolvedAsset
  leftAmount: number
  rightAmount: number
  priceBase: ResolvedAsset
  priceQuote: ResolvedAsset
  priceValue?: number
  priceLabel?: string
  priceUsd?: number
  marketCapUsd?: number
  liquidityUsd?: number
  volumes?: Partial<Record<Timeframe, Record<string, number>>>
}

const PAGE_SIZE = 40
const LIVE_POOL_REFRESH_LIMIT = 80
const SORT_METRIC_OPTIONS: Array<{ value: SortMetric; label: string }> = [
  { value: "change", label: "% Change" },
  { value: "volume", label: "Volume" },
  { value: "liquidity", label: "Liquidity" },
  { value: "marketCap", label: "Market Cap" }
]

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

  // CW20 always stays in front when paired with non-CW20.
  if (leftIsCw20 !== rightIsCw20) {
    return !leftIsCw20 && rightIsCw20
  }

  // Native LUNC/USTC pair should always be LUNC first, USTC second.
  if (left.isUstc && right.isLunc) return true

  return false
}

const formatUsdSmart = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  const plain = numberToPlainString(abs)
  const [intPartRaw, fractionRaw = ""] = plain.split(".")
  const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const keptFraction = trimFractionByNonZeroDigits(fractionRaw, 4, 24)

  if (!keptFraction) return `${sign}$${intPart}`

  const leadingZeros = keptFraction.match(/^0+/)?.[0].length ?? 0
  const significant = keptFraction.slice(leadingZeros)
  if (intPartRaw === "0" && leadingZeros >= 3 && significant) {
    return (
      <>
        {sign}$0.0
        <span className={styles.priceZeroCount}>{leadingZeros}</span>
        {significant}
      </>
    )
  }

  return `${sign}$${intPart}.${keptFraction}`
}

const fetchNativeSupplies = async (
  entries: Array<{ denom: string; decimals: number }>
) => {
  const unique = Array.from(
    new Set(entries.map((entry) => entry.denom).filter(Boolean))
  )
  if (!unique.length) return {}

  const decimalsMap = new Map(entries.map((entry) => [entry.denom, entry.decimals]))
  const result: Record<string, NativeSupplyInfo> = {}
  const limit = 6
  let index = 0

  const workers = Array.from({ length: Math.min(limit, unique.length) }, async () => {
    while (index < unique.length) {
      const current = index
      index += 1
      const denom = unique[current]
      const decimals = decimalsMap.get(denom) ?? 6
      try {
        const url = new URL(`${CLASSIC_CHAIN.lcd}/cosmos/bank/v1beta1/supply/by_denom`)
        url.searchParams.set("denom", denom)
        const response = await fetchWithEndpointFallback(url.toString())
        if (!response.ok) continue
        const data = (await response.json()) as {
          amount?: { amount?: string }
        }
        const amount = data?.amount?.amount ?? "0"
        const parsed = Number(amount)
        result[denom] = {
          denom,
          amount,
          units: Number.isFinite(parsed) ? parsed / 10 ** Math.max(0, decimals) : 0,
          decimals
        }
      } catch {
        // Ignore denom-level failures.
      }
    }
  })

  await Promise.all(workers)
  return result
}

const AssetIcon = ({
  symbol,
  candidates,
  size = 28
}: {
  symbol: string
  candidates: string[]
  size?: number
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

const Market = () => {
  const location = useLocation()
  const [search, setSearch] = useState("")
  const [sortMetric, setSortMetric] = useState<SortMetric>("liquidity")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [timeframe, setTimeframe] = useState<Timeframe>("24h")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)

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

  const nativeDenoms = useMemo(() => {
    const set = new Set<string>()
    pools.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id.startsWith("native:")) return
        const denom = asset.id.slice(7)
        if (!denom || denom.startsWith("ibc/")) return
        set.add(denom.toLowerCase())
      })
    })
    return Array.from(set)
  }, [pools])
  const ibcDenoms = useMemo(() => {
    const set = new Set<string>()
    pools.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (!asset.id.startsWith("native:ibc/")) return
        set.add(asset.id.slice(7))
      })
    })
    return Array.from(set)
  }, [pools])
  const { data: nativeWhitelist = {} } = useResolvedNativeWhitelist(nativeDenoms)
  const { data: ibcWhitelist = {} } = useResolvedIbcWhitelist(ibcDenoms)
  const { data: cw20Whitelist = {} } = useResolvedCw20Whitelist()

  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

  const { data: dashboardSnapshot } = useQuery({
    queryKey: ["dashboard", "circulating", "market"],
    queryFn: fetchCirculatingSnapshot,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000
  })

  const assetMetas = useMemo(() => {
    const map = new Map<string, number>()
    const addAsset = (id: string) => {
      if (!id) return
      if (id.startsWith("native:")) {
        const denom = id.slice(7)
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
      if (id.startsWith("cw20:")) {
        const contract = id.slice(5).toLowerCase()
        const key = normalizeAssetKey(contract)
        if (!key || map.has(key)) return
        map.set(key, cw20Whitelist[contract]?.decimals ?? 6)
      }
    }
    pools.forEach((pool) => {
      addAsset(pool.poolAssets[0]?.id ?? "")
      addAsset(pool.poolAssets[1]?.id ?? "")
    })
    return Array.from(map.entries()).map(([key, decimals]) => ({ key, decimals }))
  }, [cw20Whitelist, ibcWhitelist, nativeWhitelist, pools])

  const { data: dexEstimatedPrices } = useDexEstimatedPrices(assetMetas)

  const resolveAsset = useCallback(
    (assetId: string): ResolvedAsset => {
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
    },
    [cw20Whitelist, ibcWhitelist, nativeWhitelist]
  )

  const poolGraphUsdPrices = useMemo(
    () =>
      deriveUsdPricesFromPools({
        pools,
        seedAssetIds: ["native:uluna", "native:uusd"],
        getDecimals: (assetId) => resolveAsset(assetId).decimals,
        getSeedUsdPrice: (_assetId, normalizedKey) => {
          if (normalizedKey === "uluna") return prices?.lunc?.usd
          if (normalizedKey === "uusd") return prices?.ustc?.usd
          return undefined
        }
      }),
    [pools, prices?.lunc?.usd, prices?.ustc?.usd, resolveAsset]
  )

  const getAssetUsdPrice = useCallback(
    (asset: ResolvedAsset) => {
      if (asset.isLunc) return prices?.lunc?.usd
      if (asset.isUstc) return prices?.ustc?.usd
      const graphUsdPrice = poolGraphUsdPrices[asset.key]
      if (graphUsdPrice !== undefined) return graphUsdPrice
      const estimate = dexEstimatedPrices?.[asset.key]
      if (!estimate) return undefined
      const quoteUsd = estimate.quoteDenom === "uusd" ? prices?.ustc?.usd : prices?.lunc?.usd
      if (quoteUsd === undefined) return undefined
      return estimate.priceInQuote * quoteUsd
    },
    [dexEstimatedPrices, poolGraphUsdPrices, prices?.lunc?.usd, prices?.ustc?.usd]
  )

  const getAssetChange = useCallback(
    (asset: ResolvedAsset, tf: Timeframe) => {
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
    },
    [prices]
  )

  const buildMarketCard = useCallback(
    (pool: MarketPoolSnapshot): MarketCard | null => {
      let left = resolveAsset(pool.poolAssets[0].id)
      let right = resolveAsset(pool.poolAssets[1].id)
      let leftAmount = toUnitAmount(pool.poolAssets[0].amount, left.decimals)
      let rightAmount = toUnitAmount(pool.poolAssets[1].amount, right.decimals)

      if (shouldSwapForDisplay(left, right)) {
        ;[left, right] = [right, left]
        ;[leftAmount, rightAmount] = [rightAmount, leftAmount]
      }

      if (leftAmount <= 0 || rightAmount <= 0) return null

      // Price display rule: always use the displayed left/right order.
      const priceBase = left
      const priceQuote = right
      const priceValue = rightAmount / leftAmount

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

      const priceQuoteUsd = getAssetUsdPrice(priceQuote)
      const priceUsd = priceQuoteUsd !== undefined ? priceValue * priceQuoteUsd : undefined
      const marketCapUsd =
        priceBase.isLunc
          ? (prices?.lunc?.usd_market_cap ??
            (priceUsd !== undefined && dashboardSnapshot?.circulatingLunc
              ? priceUsd * dashboardSnapshot.circulatingLunc
              : undefined))
          : priceBase.isUstc
            ? (prices?.ustc?.usd_market_cap ??
              (priceUsd !== undefined && dashboardSnapshot?.circulatingUstc
                ? priceUsd * dashboardSnapshot.circulatingUstc
                : undefined))
            : undefined

      return {
        id: `${pool.dexId}:${pool.pair}`,
        pairAddress: pool.pair,
        pairLabel: `${left.symbol}/${right.symbol}`,
        dexId: pool.dexId,
        dexLabel: pool.dexLabel,
        volumes: pool.volumes,
        left,
        right,
        leftAmount,
        rightAmount,
        priceBase,
        priceQuote,
        priceValue,
        priceLabel: `1 ${priceBase.symbol} ≈ ${formatNumber(priceValue, priceValue < 1 ? 6 : 4)} ${priceQuote.symbol}`,
        priceUsd,
        marketCapUsd,
        liquidityUsd
      }
    },
    [
      dashboardSnapshot,
      getAssetUsdPrice,
      prices?.lunc?.usd_market_cap,
      prices?.ustc?.usd_market_cap,
      resolveAsset
    ]
  )

  const cards = useMemo<MarketCard[]>(
    () => pools.map((pool) => buildMarketCard(pool)).filter((card): card is MarketCard => Boolean(card)),
    [buildMarketCard, pools]
  )

  const cw20SupplyContracts = useMemo(
    () =>
      Array.from(
        new Set(
          cards
            .map((card) => card.priceBase.id)
            .filter((id) => id.startsWith("cw20:"))
            .map((id) => id.slice(5).toLowerCase())
        )
      ),
    [cards]
  )

  const { data: cw20Supplies = {} } = useCw20Supplies(cw20SupplyContracts, cw20Whitelist)

  const nativeSupplyDenoms = useMemo(
    () =>
      Array.from(
        new Set(
          cards
            .map((card) => card.priceBase)
            .filter((asset) => asset.id.startsWith("native:") && !asset.isLunc && !asset.isUstc)
            .map((asset) => ({ denom: asset.id.slice(7), decimals: asset.decimals }))
            .map((entry) => `${entry.denom}:${entry.decimals}`)
        )
      ).map((entry) => {
        const [denom, decimals] = entry.split(":")
        return { denom, decimals: Number(decimals || "6") }
      }),
    [cards]
  )

  const { data: nativeSupplies = {} } = useQuery({
    queryKey: [
      "native-supplies",
      nativeSupplyDenoms.map((entry) => `${entry.denom}:${entry.decimals}`).join("|")
    ],
    queryFn: () => fetchNativeSupplies(nativeSupplyDenoms),
    enabled: nativeSupplyDenoms.length > 0,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000
  })

  const getCardMarketCapUsd = useCallback(
    (card: MarketCard) => {
      // Market cap should always match the displayed base asset (left side / priceBase).
      // Do not override CW20 pairs just because quote side is LUNC/USTC.
      if (card.priceBase.isLunc) {
        return (
          prices?.lunc?.usd_market_cap ??
          (prices?.lunc?.usd !== undefined && dashboardSnapshot?.circulatingLunc
            ? prices.lunc.usd * dashboardSnapshot.circulatingLunc
            : undefined)
        )
      }
      if (card.priceBase.isUstc) {
        return (
          prices?.ustc?.usd_market_cap ??
          (prices?.ustc?.usd !== undefined && dashboardSnapshot?.circulatingUstc
            ? prices.ustc.usd * dashboardSnapshot.circulatingUstc
            : undefined)
        )
      }

      if (card.marketCapUsd !== undefined) return card.marketCapUsd
      if (card.priceBase.id.startsWith("native:") && card.priceUsd !== undefined) {
        const denom = card.priceBase.id.slice(7)
        const units = nativeSupplies[denom]?.units
        if (units !== undefined) return units * card.priceUsd
      }
      if (!card.priceBase.id.startsWith("cw20:")) return undefined
      if (card.priceUsd === undefined) return undefined
      const contract = card.priceBase.id.slice(5).toLowerCase()
      const supply = cw20Supplies[contract]?.units
      if (supply === undefined) return undefined
      return supply * card.priceUsd
    },
    [cw20Supplies, dashboardSnapshot, nativeSupplies, prices]
  )

  const getPairChange = useCallback(
    (card: MarketCard, tf: Timeframe) => {
      const baseChange = getAssetChange(card.priceBase, tf)
      const quoteChange = getAssetChange(card.priceQuote, tf)
      if (baseChange === undefined && quoteChange === undefined) return undefined
      if (baseChange !== undefined && quoteChange !== undefined) {
        return ((1 + baseChange / 100) / (1 + quoteChange / 100) - 1) * 100
      }
      if (baseChange !== undefined) return baseChange
      return quoteChange !== undefined ? -quoteChange : undefined
    },
    [getAssetChange]
  )

  const getCardVolumeUsd = useCallback(
    (card: MarketCard, tf: Timeframe) => {
      const volumeMap = card.volumes?.[tf]
      if (!volumeMap) return undefined

      const orientationKey = `${card.priceBase.key}|${card.priceQuote.key}`
      const volumeQuote = volumeMap[orientationKey]
      if (volumeQuote === undefined) return undefined

      const quoteUsd = getAssetUsdPrice(card.priceQuote)
      if (quoteUsd === undefined) return undefined
      return volumeQuote * quoteUsd
    },
    [getAssetUsdPrice]
  )

  const filteredAndSorted = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const filtered = cards.filter((card) => {
      if (!keyword) return true
      const haystack = [
        card.pairLabel,
        card.dexLabel,
        card.left.symbol,
        card.right.symbol,
        card.left.name,
        card.right.name,
        card.pairAddress,
        card.left.id,
        card.right.id
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(keyword)
    })

    filtered.sort((a, b) => {
      const resolveMetricValue = (card: MarketCard) => {
        if (sortMetric === "change") return getPairChange(card, timeframe)
        if (sortMetric === "volume") return getCardVolumeUsd(card, timeframe)
        if (sortMetric === "marketCap") return getCardMarketCapUsd(card)
        return card.liquidityUsd
      }

      const valueA = resolveMetricValue(a)
      const valueB = resolveMetricValue(b)

      if (valueA === undefined && valueB === undefined) return 0
      if (valueA === undefined) return 1
      if (valueB === undefined) return -1

      return sortDirection === "asc" ? valueA - valueB : valueB - valueA
    })

    return filtered
  }, [
    cards,
    getCardMarketCapUsd,
    getCardVolumeUsd,
    getPairChange,
    search,
    sortDirection,
    sortMetric,
    timeframe
  ])

  const visible = filteredAndSorted.slice(0, visibleCount)
  const hasMore = filteredAndSorted.length > visible.length
  const visibleCw20Contracts = useMemo(
    () =>
      Array.from(
        new Set(
          visible.flatMap((card) =>
            [card.left.id, card.right.id, card.priceBase.id, card.priceQuote.id]
              .filter((id) => id.startsWith("cw20:"))
              .map((id) => id.slice(5).toLowerCase())
          )
        )
      ).sort(),
    [visible]
  )
  const { data: visibleCw20Whitelist = {} } =
    useResolvedCw20Whitelist(visibleCw20Contracts)
  const liveRefreshCards = visible.slice(0, LIVE_POOL_REFRESH_LIMIT)
  const liveRefreshKey = liveRefreshCards
    .map((card) => `${card.dexId}:${card.pairAddress}`)
    .join("|")

  const { data: liveVisiblePools = [] } = useQuery({
    queryKey: ["market", "visible-pools-live", liveRefreshKey],
    queryFn: async () => {
      const rows = await Promise.all(
        liveRefreshCards.map((card) =>
          fetchMarketPoolLive({
            pair: card.pairAddress,
            dexId: card.dexId,
            dexLabel: card.dexLabel,
            type: "xyk",
            assets: [card.left.key, card.right.key]
          })
        )
      )
      return rows.filter((row): row is MarketPoolSnapshot => Boolean(row))
    },
    enabled: liveRefreshCards.length > 0,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000
  })

  const liveCardById = useMemo(() => {
    const map = new Map<string, MarketCard>()
    liveVisiblePools.forEach((pool) => {
      const card = buildMarketCard(pool)
      if (card) map.set(card.id, card)
    })
    return map
  }, [buildMarketCard, liveVisiblePools])

  const hydrateVisibleCw20Asset = useCallback(
    (asset: ResolvedAsset): ResolvedAsset => {
      if (!asset.id.startsWith("cw20:")) return asset

      const contract = asset.id.slice(5).toLowerCase()
      const token = visibleCw20Whitelist[contract]
      if (!token) return asset

      const symbol = token.symbol || asset.symbol
      return {
        ...asset,
        symbol,
        name: token.name || symbol,
        decimals: token.decimals ?? asset.decimals,
        iconCandidates: buildCw20IconCandidates(token.icon, symbol)
      }
    },
    [visibleCw20Whitelist]
  )

  const hydrateVisibleCard = useCallback(
    (card: MarketCard): MarketCard => {
      const left = hydrateVisibleCw20Asset(card.left)
      const right = hydrateVisibleCw20Asset(card.right)
      const priceBase =
        card.priceBase.id === card.left.id
          ? left
          : card.priceBase.id === card.right.id
            ? right
            : hydrateVisibleCw20Asset(card.priceBase)
      const priceQuote =
        card.priceQuote.id === card.left.id
          ? left
          : card.priceQuote.id === card.right.id
            ? right
            : hydrateVisibleCw20Asset(card.priceQuote)

      return {
        ...card,
        left,
        right,
        priceBase,
        priceQuote,
        pairLabel: `${left.symbol}/${right.symbol}`,
        priceLabel:
          card.priceValue !== undefined
            ? `1 ${priceBase.symbol} ≈ ${formatNumber(card.priceValue, card.priceValue < 1 ? 6 : 4)} ${priceQuote.symbol}`
            : card.priceLabel
      }
    },
    [hydrateVisibleCw20Asset]
  )

  const displayVisible = useMemo(
    () => visible.map((card) => hydrateVisibleCard(liveCardById.get(card.id) ?? card)),
    [hydrateVisibleCard, liveCardById, visible]
  )
  const isLoading = isPairsLoading || isPoolsLoading
  const selectedSortMetric =
    SORT_METRIC_OPTIONS.find((option) => option.value === sortMetric) ?? SORT_METRIC_OPTIONS[0]

  useEffect(() => {
    if (!sortMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSortMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [sortMenuOpen])


  return (
    <PageShell title="Market">
      <div className={styles.marketShell}>
        <section className={`card ${styles.toolbar}`}>
          <div className={styles.toolbarMain}>
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search pools / tokens / contracts"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setVisibleCount(PAGE_SIZE)
              }}
            />
            <div className={styles.sortControls}>
              <button
                type="button"
                className={styles.directionButton}
                onClick={() => {
                  setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
                  setVisibleCount(PAGE_SIZE)
                }}
                aria-label={sortDirection === "desc" ? "Descending order" : "Ascending order"}
                title={sortDirection === "desc" ? "Descending" : "Ascending"}
              >
                <span className={styles.directionGlyph} aria-hidden="true">
                  <span className={styles.directionBars}>
                    <span className={`${styles.directionBar} ${styles.directionBarLong}`} />
                    <span className={`${styles.directionBar} ${styles.directionBarMedium}`} />
                    <span className={`${styles.directionBar} ${styles.directionBarShort}`} />
                  </span>
                  <span
                    className={`${styles.directionArrow} ${
                      sortDirection === "asc" ? styles.directionArrowAsc : ""
                    }`}
                  />
                </span>
              </button>
              <div className={styles.sortWrap} ref={sortMenuRef}>
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortMenuOpen ? styles.sortButtonOpen : ""}`}
                  onClick={() => setSortMenuOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={sortMenuOpen}
                >
                  <span className={styles.sortButtonValue}>{selectedSortMetric.label}</span>
                  <span
                    className={`${styles.sortButtonChevron} ${
                      sortMenuOpen ? styles.sortButtonChevronOpen : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {sortMenuOpen ? (
                  <div className={styles.sortMenu} role="listbox" aria-label="Sort market pools">
                    {SORT_METRIC_OPTIONS.map((option) => {
                      const active = option.value === sortMetric
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`${styles.sortOption} ${active ? styles.sortOptionActive : ""}`}
                          onClick={() => {
                            setSortMetric(option.value)
                            setVisibleCount(PAGE_SIZE)
                            setSortMenuOpen(false)
                          }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className={styles.toolbarFooter}>
            <div className={styles.meta}>{isLoading ? "Loading pools..." : `${filteredAndSorted.length} pools`}</div>
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
          </div>
        </section>

        {isLoading ? (
          <section className={`card ${styles.empty}`}>Loading market data...</section>
        ) : displayVisible.length === 0 ? (
          <section className={`card ${styles.empty}`}>
            No pool matched your search. Try another symbol or contract.
          </section>
        ) : (
          <>
            <section className={styles.grid}>
              {displayVisible.map((card, index) => {
                const pairChange = getPairChange(card, timeframe)
                const marketCapUsd = getCardMarketCapUsd(card)
                const { dexName, dexVersion } = splitDexLabel(card.dexLabel)
                return (
                  <Link
                    key={card.id}
                    to={`/market/pair/${encodeURIComponent(card.dexId)}/${encodeURIComponent(card.pairAddress)}`}
                    state={{
                      fromMarket: true,
                      marketLocation: {
                        pathname: location.pathname,
                        search: location.search,
                        hash: location.hash
                      }
                    }}
                    className={styles.poolCardLink}
                  >
                    <article className={`card ${styles.poolCard}`}>
                      <header className={styles.cardHeader}>
                        <div className={styles.pairIcons}>
                          <div className={styles.pairStack}>
                            <span className={styles.pairIconPrimary}>
                              <AssetIcon
                                symbol={card.left.symbol}
                                candidates={card.left.iconCandidates}
                                size={40}
                              />
                            </span>
                            <span className={styles.pairIconSecondary}>
                              <AssetIcon
                                symbol={card.right.symbol}
                                candidates={card.right.iconCandidates}
                                size={22}
                              />
                            </span>
                          </div>
                        </div>

                        <div className={styles.headerRight}>
                          <div className={styles.headerTop}>
                            <div className={styles.pairTitle}>
                              <span className={styles.pairBase}>{card.left.symbol}</span>
                              <span className={styles.pairDivider}>/</span>
                              <span className={styles.pairQuote}>{card.right.symbol}</span>
                            </div>
                            <div className={styles.rank}>#{index + 1}</div>
                          </div>

                          <div className={styles.tags}>
                            <span className={styles.dexTag}>{dexName}</span>
                            {dexVersion ? <span className={styles.dexVersionTag}>{dexVersion}</span> : null}
                          </div>
                        </div>
                      </header>

                      <div className={styles.content}>
                        <div className={styles.leftMetrics}>
                          <div className={styles.metricLine}>
                            <span>Mkt Cap</span>
                            <strong>{formatUsdCompact(marketCapUsd)}</strong>
                          </div>
                          <div className={styles.metricLine}>
                            <span>Liquidity</span>
                            <strong>{card.liquidityUsd !== undefined ? formatUsd(card.liquidityUsd) : "--"}</strong>
                          </div>
                        </div>

                        <div className={styles.rightMetrics}>
                          <div className={styles.price}>{card.priceUsd !== undefined ? formatUsdSmart(card.priceUsd) : "--"}</div>
                          <div
                            className={`${styles.change} ${
                              pairChange === undefined
                                ? styles.changeFlat
                                : pairChange >= 0
                                  ? styles.changeUp
                                  : styles.changeDown
                            }`}
                          >
                            {timeframe}: {pairChange === undefined ? "--" : formatPercent(pairChange)}
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                )
              })}
            </section>

            {hasMore ? (
              <div className={styles.loadMoreWrap}>
                <button
                  type="button"
                  className={`uiButton uiButtonPrimary ${styles.loadMore}`}
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                >
                  Load more
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  )
}

export default Market
