import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./Market.module.css"
import { CLASSIC_CHAIN } from "../app/chain"
import {
  fetchMarketDexPairs,
  fetchMarketPools,
  getMarketPoolIbcDenoms
} from "../app/data/market"
import { useCw20Whitelist, useResolvedIbcWhitelist } from "../app/data/terraAssets"
import { useCw20Supplies } from "../app/data/cw20"
import { fetchPrices } from "../app/data/classic"
import { fetchCurrentDashboardSnapshot } from "../app/data/dashboard"
import { useDexEstimatedPrices } from "../app/data/dexPrices"
import { formatNumber, formatPercent, formatUsd, toUnitAmount } from "../app/utils/format"

type SortKey = "liquidity_desc" | "liquidity_asc" | "pair_az" | "pair_za" | "dex_az"
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
}

const ASSET_URL = "https://assets.terra.dev"
const PAGE_SIZE = 40

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

  // CW20 always stays in front when paired with non-CW20.
  if (leftIsCw20 !== rightIsCw20) {
    return !leftIsCw20 && rightIsCw20
  }

  // Native LUNC/USTC pair should always be LUNC first, USTC second.
  if (left.isUstc && right.isLunc) return true

  return false
}

const numberToPlainString = (value: number) => {
  if (!Number.isFinite(value)) return String(value)
  const raw = value.toString()
  if (!raw.toLowerCase().includes("e")) return raw

  const sign = raw.startsWith("-") ? "-" : ""
  const normalized = sign ? raw.slice(1) : raw
  const [coefficient, exponentPart] = normalized.toLowerCase().split("e")
  const exponent = Number(exponentPart)
  const [intPart, fracPart = ""] = coefficient.split(".")
  const digits = `${intPart}${fracPart}`
  const decimalIndex = intPart.length + exponent

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
}

const trimFractionByNonZeroDigits = (
  fraction: string,
  maxNonZeroDigits = 4,
  hardFractionCap = 24
) => {
  if (!fraction) return ""
  let kept = ""
  let nonZeroCount = 0
  for (const digit of fraction) {
    if (kept.length >= hardFractionCap) break
    kept += digit
    if (digit !== "0") {
      nonZeroCount += 1
      if (nonZeroCount >= maxNonZeroDigits) break
    }
  }
  return nonZeroCount > 0 ? kept : ""
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
        const response = await fetch(url.toString())
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

const Market = () => {
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortKey>("liquidity_desc")
  const [timeframe, setTimeframe] = useState<Timeframe>("24h")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

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
    queryKey: ["dashboard", "snapshot", "market"],
    queryFn: fetchCurrentDashboardSnapshot,
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
          : 6
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
  }, [cw20Whitelist, ibcWhitelist, pools])

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

  const cards = useMemo<MarketCard[]>(() => {
    const mapped: MarketCard[] = []

    pools.forEach((pool) => {
      let left = resolveAsset(pool.poolAssets[0].id)
      let right = resolveAsset(pool.poolAssets[1].id)
      let leftAmount = toUnitAmount(pool.poolAssets[0].amount, left.decimals)
      let rightAmount = toUnitAmount(pool.poolAssets[1].amount, right.decimals)

      if (shouldSwapForDisplay(left, right)) {
        ;[left, right] = [right, left]
        ;[leftAmount, rightAmount] = [rightAmount, leftAmount]
      }

      if (leftAmount <= 0 || rightAmount <= 0) return

      // Price display rule: always use the displayed left/right order.
      let priceBase = left
      let priceQuote = right
      let priceValue = rightAmount / leftAmount

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

      mapped.push({
        id: `${pool.dexId}:${pool.pair}`,
        pairAddress: pool.pair,
        pairLabel: `${left.symbol}/${right.symbol}`,
        dexId: pool.dexId,
        dexLabel: pool.dexLabel,
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
      })
    })

    return mapped
  }, [
    dashboardSnapshot?.circulatingLunc,
    dashboardSnapshot?.circulatingUstc,
    dexEstimatedPrices,
    pools,
    prices?.lunc?.usd_market_cap,
    prices?.lunc?.usd,
    prices?.ustc?.usd_market_cap,
    prices?.ustc?.usd
  ])

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
        card.right.name
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(keyword)
    })

    filtered.sort((a, b) => {
      if (sortBy === "pair_az") return a.pairLabel.localeCompare(b.pairLabel)
      if (sortBy === "pair_za") return b.pairLabel.localeCompare(a.pairLabel)
      if (sortBy === "dex_az") return a.dexLabel.localeCompare(b.dexLabel)
      if (sortBy === "liquidity_asc") return (a.liquidityUsd ?? 0) - (b.liquidityUsd ?? 0)
      return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)
    })

    return filtered
  }, [cards, search, sortBy])

  const getCardMarketCapUsd = (card: MarketCard) => {
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
  }

  const visible = filteredAndSorted.slice(0, visibleCount)
  const hasMore = filteredAndSorted.length > visible.length
  const isLoading = isPairsLoading || isPoolsLoading

  const getPairChange = (card: MarketCard, tf: Timeframe) => {
    const baseChange = getAssetChange(card.priceBase, tf)
    const quoteChange = getAssetChange(card.priceQuote, tf)
    if (baseChange === undefined && quoteChange === undefined) return undefined
    if (baseChange !== undefined && quoteChange !== undefined) {
      return ((1 + baseChange / 100) / (1 + quoteChange / 100) - 1) * 100
    }
    if (baseChange !== undefined) return baseChange
    return quoteChange !== undefined ? -quoteChange : undefined
  }

  return (
    <PageShell title="Market">
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
          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as SortKey)
              setVisibleCount(PAGE_SIZE)
            }}
          >
            <option value="liquidity_desc">Liquidity: high to low</option>
            <option value="liquidity_asc">Liquidity: low to high</option>
            <option value="pair_az">Pair: A to Z</option>
            <option value="pair_za">Pair: Z to A</option>
            <option value="dex_az">DEX: A to Z</option>
          </select>
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
      ) : visible.length === 0 ? (
        <section className={`card ${styles.empty}`}>
          No pool matched your search. Try another symbol or contract.
        </section>
      ) : (
        <>
          <section className={styles.grid}>
            {visible.map((card, index) => {
              const pairChange = getPairChange(card, timeframe)
              const marketCapUsd = getCardMarketCapUsd(card)
              const { dexName, dexVersion } = splitDexLabel(card.dexLabel)
              return (
                <Link
                  key={card.id}
                  to={`/market/pair/${encodeURIComponent(card.dexId)}/${encodeURIComponent(card.pairAddress)}`}
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
    </PageShell>
  )
}

export default Market
