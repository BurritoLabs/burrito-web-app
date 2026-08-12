import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../Dashboard.module.css"
import {
  fetchCurrentDashboardSnapshot,
  fetchCurrentPhoenixDashboardSnapshot
} from "../../app/data/dashboard"
import { fetchBinodesDashboardActivity } from "../../app/data/binodes"
import { fetchPrices } from "../../app/data/classic"
import {
  calculateHistoryChange,
  fetchDashboardPriceHistory,
  type DashboardHistoryPoint
} from "../../app/data/dashboardHistory"
import { formatNumber, formatPercent } from "../../app/utils/format"
import {
  dashboardRangeOptions,
  dashboardRanges,
  formatBlockInterval,
  formatUsdCompact,
  formatUsdSmart,
  formatValue,
  getIsMobileDashboard,
  type DashboardRange,
  type MetricItem
} from "../../app/dashboard/dashboardFormat"
import {
  DashboardMetricCard,
  DashboardMetricSkeletons
} from "./DashboardMetricCard"
import {
  BarChart,
  GroupedBurnChart,
  LineChart,
  MiniTrend
} from "./DashboardCharts"
import { useAppChain } from "../../app/appChainContext"

const useDeferredHistoryEnabled = () => {
  const [enabled, setEnabled] = useState(() => !getIsMobileDashboard())

  useEffect(() => {
    if (enabled) return

    const run = () => setEnabled(true)
    const walletWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number }
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (walletWindow.requestIdleCallback) {
      const handle = walletWindow.requestIdleCallback(run, { timeout: 4500 })
      return () => walletWindow.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(run, 2500)
    return () => window.clearTimeout(timer)
  }, [enabled])

  return enabled
}

const compactAssetAmount = (value?: number, symbol?: string) => {
  if (!Number.isFinite(value)) return "--"
  return `${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(Number(value))}${symbol ? ` ${symbol}` : ""}`
}

const buildFallbackTrend = (
  currentPrice: number | undefined,
  percentageChange: number | undefined,
  rangeMs: number
): DashboardHistoryPoint[] => {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(percentageChange)) return []
  const divisor = 1 + Number(percentageChange) / 100
  if (!divisor) return []
  return [
    { time: Date.now() - rangeMs, value: Number(currentPrice) / divisor },
    { time: Date.now(), value: Number(currentPrice) }
  ]
}

const marketChange = ({
  range,
  history,
  change24h,
  change7d
}: {
  range: DashboardRange
  history?: DashboardHistoryPoint[]
  change24h?: number
  change7d?: number
}) => {
  if (range === "24h") return change24h
  const historicalChange = calculateHistoryChange(history)
  if (historicalChange !== undefined) return historicalChange
  return range === "7d" ? change7d : undefined
}

const MarketCard = ({
  symbol,
  price,
  marketCap,
  change,
  points,
  color,
  tone
}: {
  symbol: string
  price?: number
  marketCap?: number
  change?: number
  points: DashboardHistoryPoint[]
  color: string
  tone: "lunc" | "ustc" | "luna"
}) => (
  <article className={`card ${styles.marketCard} ${styles[`marketCard${tone}`]}`}>
    <div className={styles.marketHeading}>
      <span className={`${styles.assetDot} ${styles[`assetDot${tone}`]}`} />
      <span>{symbol}</span>
    </div>
    <div className={styles.marketPriceRow}>
      <strong className={styles.marketPrice}>{formatUsdSmart(price)}</strong>
      {Number.isFinite(change) ? (
        <span
          className={`${styles.marketChange} ${
            Number(change) >= 0 ? styles.up : styles.down
          }`}
        >
          {formatPercent(Number(change))}
        </span>
      ) : null}
    </div>
    <MiniTrend points={points} color={color} label={`${symbol} price trend`} />
    <div className={styles.marketFooter}>
      <span>Market cap</span>
      <strong>{formatUsdCompact(marketCap)}</strong>
    </div>
  </article>
)

const TrendCard = ({
  title,
  value,
  meta,
  children,
  legend
}: {
  title: string
  value: string
  meta?: string
  children: React.ReactNode
  legend?: React.ReactNode
}) => (
  <article className={`card ${styles.trendCard}`}>
    <div className={styles.trendHeader}>
      <div>
        <div className={styles.trendTitle}>{title}</div>
        <div className={styles.trendValue}>{value}</div>
      </div>
      {meta ? <span className={styles.trendMeta}>{meta}</span> : null}
    </div>
    <div className={styles.chartLegend}>{legend}</div>
    <div className={styles.chartArea}>{children}</div>
  </article>
)

const AssetMetricCard = ({
  label,
  rows
}: {
  label: string
  rows: Array<{ symbol: string; value: string; tone?: "lunc" | "ustc" | "luna" }>
}) => (
  <article className={`card ${styles.assetMetricCard}`}>
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.assetMetricRows}>
      {rows.map((row) => (
        <div className={styles.assetMetricRow} key={row.symbol}>
          <span className={styles.assetMetricValue}>{row.value}</span>
          <span className={styles.assetMetricSymbol}>
            <i className={`${styles.assetMetricDot} ${row.tone ? styles[`assetMetricDot${row.tone}`] : ""}`} />
            {row.symbol}
          </span>
        </div>
      ))}
    </div>
  </article>
)

const Dashboard = () => {
  const { chain, chainKey } = useAppChain()
  const isClassic = chainKey === "lunc"
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>("24h")
  const activeRange = dashboardRanges[dashboardRange]
  const historyEnabled = useDeferredHistoryEnabled()

  const { data: currentSnapshot } = useQuery({
    queryKey: ["dashboard", chain.chainId, "snapshot", "current"],
    queryFn: isClassic
      ? fetchCurrentDashboardSnapshot
      : fetchCurrentPhoenixDashboardSnapshot,
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000
  })

  const { data: prices } = useQuery({
    queryKey: ["prices", chain.chainId],
    queryFn: fetchPrices,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

  const { data: luncPriceHistory } = useQuery({
    queryKey: ["dashboard", "price-history", "lunc", dashboardRange],
    queryFn: () =>
      fetchDashboardPriceHistory("lunc", activeRange.rangeMs, prices?.lunc?.usd),
    enabled: isClassic,
    staleTime: activeRange.ttlMs,
    retry: 1
  })

  const { data: ustcPriceHistory } = useQuery({
    queryKey: ["dashboard", "price-history", "ustc", dashboardRange],
    queryFn: () =>
      fetchDashboardPriceHistory("ustc", activeRange.rangeMs, prices?.ustc?.usd),
    enabled: isClassic,
    staleTime: activeRange.ttlMs,
    retry: 1
  })

  const { data: lunaPriceHistory } = useQuery({
    queryKey: ["dashboard", "price-history", "luna", dashboardRange],
    queryFn: () =>
      fetchDashboardPriceHistory("luna", activeRange.rangeMs, prices?.luna?.usd),
    enabled: !isClassic,
    staleTime: activeRange.ttlMs,
    retry: 1
  })

  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityError
  } = useQuery({
    queryKey: [
      "binodes",
      "dashboard",
      chain.chainId,
      "activity",
      activeRange.activityFrequency,
      activeRange.activityBuckets
    ],
    queryFn: () =>
      fetchBinodesDashboardActivity(
        activeRange.activityFrequency,
        activeRange.activityBuckets
      ),
    enabled: isClassic && historyEnabled,
    staleTime: activeRange.ttlMs,
    refetchInterval: 10 * 60 * 1000,
    retry: 1
  })

  const luncChange = marketChange({
    range: dashboardRange,
    history: luncPriceHistory,
    change24h: prices?.lunc?.usd_24h_change,
    change7d: prices?.lunc?.usd_7d_change
  })
  const ustcChange = marketChange({
    range: dashboardRange,
    history: ustcPriceHistory,
    change24h: prices?.ustc?.usd_24h_change,
    change7d: prices?.ustc?.usd_7d_change
  })
  const lunaChange = marketChange({
    range: dashboardRange,
    history: lunaPriceHistory,
    change24h: prices?.luna?.usd_24h_change,
    change7d: prices?.luna?.usd_7d_change
  })

  const luncTrend =
    luncPriceHistory?.length
      ? luncPriceHistory
      : buildFallbackTrend(prices?.lunc?.usd, luncChange, activeRange.rangeMs)
  const ustcTrend =
    ustcPriceHistory?.length
      ? ustcPriceHistory
      : buildFallbackTrend(prices?.ustc?.usd, ustcChange, activeRange.rangeMs)
  const lunaTrend =
    lunaPriceHistory?.length
      ? lunaPriceHistory
      : buildFallbackTrend(prices?.luna?.usd, lunaChange, activeRange.rangeMs)

  const metrics = useMemo<MetricItem[]>(() => {
    if (!currentSnapshot) return []
    if (!isClassic) {
      return [
        {
          key: "staked",
          label: "Total Staked",
          value: formatValue(currentSnapshot.stakedLunc, 0),
          unit: "LUNA"
        },
        {
          key: "stakingRatio",
          label: "Staking Ratio",
          value: formatValue(currentSnapshot.stakingRatio * 100, 2),
          unit: "%"
        },
        {
          key: "validators",
          label: "Active Validators",
          value: currentSnapshot.activeValidators
            ? `${formatNumber(currentSnapshot.activeValidators, 0)} / ${formatNumber(
                currentSnapshot.maxValidators ?? 0,
                0
              )}`
            : "--"
        },
        {
          key: "blockTime",
          label: "Block Time",
          value: formatBlockInterval(currentSnapshot.blockTimeMs)
        }
      ]
    }

    return [
      {
        key: "staked",
        label: "Total Staked",
        value: formatValue(currentSnapshot.stakedLunc, 0),
        unit: "LUNC"
      },
      {
        key: "stakingRatio",
        label: "Staking Ratio",
        value: formatValue(currentSnapshot.stakingRatio * 100, 2),
        unit: "%"
      },
      {
        key: "validators",
        label: "Active Validators",
        value: currentSnapshot.activeValidators
          ? `${formatNumber(currentSnapshot.activeValidators, 0)} / ${formatNumber(
              currentSnapshot.maxValidators ?? 0,
              0
            )}`
          : "--"
      },
      {
        key: "blockTime",
        label: "Block Time",
        value: formatBlockInterval(currentSnapshot.blockTimeMs)
      }
    ]
  }, [currentSnapshot, isClassic])

  const chainMetrics = metrics.filter((item) =>
    ["staked", "stakingRatio", "validators", "blockTime"].includes(item.key)
  )

  const activitySeries = activity?.series ?? []
  const toPoint = (
    field: "transferAmountUsd" | "activeAddressCount"
  ): DashboardHistoryPoint[] =>
    activitySeries.map((point) => ({
      time: new Date(point.dt).getTime(),
      value: point[field] ?? 0
    }))
  const volumeSeries = toPoint("transferAmountUsd")
  const walletSeries = toPoint("activeAddressCount")
  const burnSeries = activitySeries.map((point) => ({
    time: new Date(point.dt).getTime(),
    value: point.luncBurnUsd ?? 0,
    secondaryValue: point.ustcBurnUsd ?? 0
  }))
  const volumeTotal = volumeSeries.reduce((sum, point) => sum + point.value, 0)
  const latestWalletCount = walletSeries.at(-1)?.value
  const stakedValueUsd =
    (currentSnapshot?.stakedLunc ?? 0) * (prices?.lunc?.usd ?? 0)
  const annualizationFactor =
    activeRange.activityFrequency === "HOUR" ? 24 * 365 : 365
  const stakingReturn = activitySeries
    .map((point) => ({
      time: new Date(point.dt).getTime(),
      value: stakedValueUsd
        ? ((point.feeGasUsd ?? 0) * annualizationFactor * 100) / stakedValueUsd
        : 0
    }))
    .filter((point) => point.value > 0)
  const latestStakingReturn = stakingReturn.at(-1)?.value
  const luncBurnAmount =
    (activity?.luncBurns?.fee_burn_amt_actual ?? 0) +
    (activity?.luncBurns?.voluntary_burn_amt_actual ?? 0)
  const ustcBurnAmount =
    (activity?.ustcBurns?.fee_burn_amt_actual ?? 0) +
    (activity?.ustcBurns?.voluntary_burn_amt_actual ?? 0)

  return (
    <PageShell
      title="Dashboard"
      inlineExtraOnMobile
      extra={
        <div className={styles.rangeSwitch} aria-label="Dashboard range">
          {dashboardRangeOptions.map((range) => (
            <button
              key={range}
              type="button"
              className={`${styles.rangeButton} ${
                dashboardRange === range ? styles.rangeButtonActive : ""
              }`}
              onClick={() => setDashboardRange(range)}
              aria-pressed={dashboardRange === range}
            >
              {dashboardRanges[range].label}
            </button>
          ))}
        </div>
      }
    >
      <div className={styles.page}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>Market</div>
          <div className={`${styles.marketGrid} ${!isClassic ? styles.marketGridSingle : ""}`}>
            {isClassic ? (
              <>
                <MarketCard
                  symbol="LUNC"
                  price={prices?.lunc?.usd}
                  marketCap={prices?.lunc?.usd_market_cap}
                  change={luncChange}
                  points={luncTrend}
                  color="var(--dashboard-lunc)"
                  tone="lunc"
                />
                <MarketCard
                  symbol="USTC"
                  price={prices?.ustc?.usd}
                  marketCap={prices?.ustc?.usd_market_cap}
                  change={ustcChange}
                  points={ustcTrend}
                  color="var(--dashboard-ustc)"
                  tone="ustc"
                />
              </>
            ) : (
              <MarketCard
                symbol="LUNA"
                price={prices?.luna?.usd}
                marketCap={prices?.luna?.usd_market_cap}
                change={lunaChange}
                points={lunaTrend}
                color="var(--dashboard-luna)"
                tone="luna"
              />
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Supply</div>
          <div className={styles.dualMetrics}>
            {currentSnapshot ? (
              <>
                <AssetMetricCard
                  label="Circulating Supply"
                  rows={isClassic ? [
                    { symbol: "LUNC", value: formatValue(currentSnapshot.circulatingLunc, 0), tone: "lunc" },
                    { symbol: "USTC", value: formatValue(currentSnapshot.circulatingUstc, 0), tone: "ustc" }
                  ] : [
                    { symbol: "LUNA", value: formatValue(currentSnapshot.circulatingLunc, 0), tone: "luna" }
                  ]}
                />
                <AssetMetricCard
                  label="Total Supply"
                  rows={isClassic ? [
                    { symbol: "LUNC", value: formatValue(currentSnapshot.luncSupply, 0), tone: "lunc" },
                    { symbol: "USTC", value: formatValue(currentSnapshot.ustcSupply, 0), tone: "ustc" }
                  ] : [
                    { symbol: "LUNA", value: formatValue(currentSnapshot.luncSupply, 0), tone: "luna" }
                  ]}
                />
              </>
            ) : (
              <DashboardMetricSkeletons count={2} />
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Treasury</div>
          <div className={styles.dualMetrics}>
            {currentSnapshot ? (
              <>
                <AssetMetricCard
                  label="Community Pool"
                  rows={isClassic ? [
                    { symbol: "LUNC", value: formatValue(currentSnapshot.luncCommunity, 2), tone: "lunc" },
                    { symbol: "USTC", value: formatValue(currentSnapshot.ustcCommunity, 2), tone: "ustc" }
                  ] : [
                    { symbol: "LUNA", value: formatValue(currentSnapshot.luncCommunity, 2), tone: "luna" }
                  ]}
                />
                <AssetMetricCard
                  label={isClassic ? "Oracle Pool" : "Inflation Rate"}
                  rows={isClassic ? [
                    { symbol: "LUNC", value: formatValue(currentSnapshot.luncOracle, 2), tone: "lunc" },
                    { symbol: "USTC", value: formatValue(currentSnapshot.ustcOracle, 2), tone: "ustc" }
                  ] : [
                    {
                      symbol: "ANNUAL",
                      value: currentSnapshot.inflation === undefined
                        ? "--"
                        : `${formatValue(currentSnapshot.inflation * 100, 2)}%`,
                      tone: "luna"
                    }
                  ]}
                />
              </>
            ) : (
              <DashboardMetricSkeletons count={2} />
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Staking &amp; Chain</div>
          <div className={styles.compactMetrics}>
            {chainMetrics.length ? (
              chainMetrics.map((item) => <DashboardMetricCard key={item.key} item={item} />)
            ) : (
              <DashboardMetricSkeletons count={4} />
            )}
          </div>
        </section>

        {isClassic ? (
          <section className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <div>
                <div className={styles.sectionHeader}>Network Trends</div>
                <p className={styles.sectionSubtext}>Terra Classic network activity</p>
              </div>
              <span className={styles.poweredByLine}>Data by BiNodes</span>
            </div>
            {activityError ? (
              <div className={styles.dataNotice}>Network trend data is temporarily unavailable.</div>
            ) : null}
            <div className={styles.trendGrid} aria-busy={activityLoading}>
              <TrendCard title="Transaction Volume" value={formatUsdCompact(volumeTotal)}>
                <BarChart
                  points={volumeSeries}
                  color="var(--dashboard-chain)"
                  label="Transaction volume"
                  valuePrefix="$"
                />
              </TrendCard>
              <TrendCard
                title="Staking Return"
                value={
                  Number.isFinite(latestStakingReturn)
                    ? formatPercent(Number(latestStakingReturn))
                    : "--"
                }
                meta={stakingReturn.length ? "Estimated annualized" : "Data unavailable"}
              >
                <LineChart
                  points={stakingReturn}
                  color="var(--dashboard-staking)"
                  label="Annualized staking return"
                  valueSuffix="%"
                />
              </TrendCard>
              <TrendCard
                title="Burn Activity"
                value={`${compactAssetAmount(luncBurnAmount, "LUNC")} · ${compactAssetAmount(
                  ustcBurnAmount,
                  "USTC"
                )}`}
                legend={
                  <>
                    <span><i className={styles.legendLunc} />LUNC</span>
                    <span><i className={styles.legendUstc} />USTC</span>
                  </>
                }
              >
                <GroupedBurnChart points={burnSeries} label="LUNC and USTC burn activity" />
              </TrendCard>
              <TrendCard
                title="Active Wallets"
                value={formatValue(latestWalletCount, 0)}
              >
                <LineChart
                  points={walletSeries}
                  color="var(--dashboard-chain)"
                  label="Active wallet addresses"
                />
              </TrendCard>
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  )
}

export default Dashboard
