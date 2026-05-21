import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../Dashboard.module.css"
import {
  fetchCurrentDashboardSnapshot,
  fetchHistoricalDashboardSnapshot,
  type DashboardSnapshot
} from "../../app/data/dashboard"
import {
  fetchBinodesDashboardActivity
} from "../../app/data/binodes"
import { fetchPrices } from "../../app/data/classic"
import { formatNumber, formatPercent } from "../../app/utils/format"
import {
  dashboardRangeOptions,
  dashboardRanges,
  formatBlockInterval,
  formatDelta,
  formatOracleDelta,
  formatUsdCompact,
  formatUsdSmart,
  formatUsdStandard,
  formatUtcHour,
  formatValue,
  getIsMobileDashboard,
  type DashboardRange,
  type MetricItem
} from "../../app/dashboard/dashboardFormat"
import {
  DashboardMetricCard,
  DashboardMetricSkeletons
} from "./DashboardMetricCard"

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
      const handle = walletWindow.requestIdleCallback(run, { timeout: 6000 })
      return () => walletWindow.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(run, 4500)
    return () => window.clearTimeout(timer)
  }, [enabled])

  return enabled
}

const Dashboard = () => {
  const [dashboardRange, setDashboardRange] =
    useState<DashboardRange>("24h")
  const activeRange = dashboardRanges[dashboardRange]
  const historyEnabled = useDeferredHistoryEnabled()

  const { data: currentSnapshot } = useQuery({
    queryKey: ["dashboard", "snapshot", "current"],
    queryFn: fetchCurrentDashboardSnapshot,
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000
  })

  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

  const { data: previousSnapshot, isFetching: previousSnapshotLoading } =
    useQuery({
      queryKey: ["dashboard", "snapshot", "historical", dashboardRange],
      queryFn: () =>
        fetchHistoricalDashboardSnapshot(
          dashboardRange,
          activeRange.rangeMs,
          activeRange.ttlMs
        ),
      enabled: Boolean(currentSnapshot) && historyEnabled,
      staleTime: activeRange.ttlMs
    })

  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityError
  } = useQuery({
    queryKey: [
      "binodes",
      "dashboard",
      "activity",
      activeRange.activityFrequency
    ],
    queryFn: () =>
      fetchBinodesDashboardActivity(activeRange.activityFrequency, 1),
    staleTime: activeRange.ttlMs,
    refetchInterval: 10 * 60 * 1000,
    retry: 1
  })

  const activityTimestamp =
    activity?.network?.dt ??
    activity?.dex?.dt ??
    activity?.burns?.dt ??
    activity?.ibc?.dt ??
    activity?.stake?.dt ??
    activity?.fees?.dt ??
    activity?.governance?.dt

  const activitySeries = useMemo(() => activity?.series ?? [], [activity?.series])
  const activityLatest = activitySeries.at(-1)

  const metrics = useMemo<MetricItem[]>(() => {
    if (!currentSnapshot) return []
    const prev: DashboardSnapshot | undefined = previousSnapshot
    const deltaFromPrev = (current: number, previous?: number) =>
      previous === undefined ? undefined : current - previous

    const luncPrice = prices?.lunc?.usd
    const ustcPrice = prices?.ustc?.usd
    const luncChange =
      dashboardRange === "1h"
        ? prices?.lunc?.usd_1h_change
        : dashboardRange === "7d"
          ? prices?.lunc?.usd_7d_change
          : prices?.lunc?.usd_24h_change
    const ustcChange =
      dashboardRange === "1h"
        ? prices?.ustc?.usd_1h_change
        : dashboardRange === "7d"
          ? prices?.ustc?.usd_7d_change
          : prices?.ustc?.usd_24h_change
    const luncMarketCap =
      luncPrice && currentSnapshot.circulatingLunc
        ? luncPrice * currentSnapshot.circulatingLunc
        : undefined
    const ustcMarketCap =
      ustcPrice && currentSnapshot.circulatingUstc
        ? ustcPrice * currentSnapshot.circulatingUstc
        : undefined

    const stakingRatio = currentSnapshot.stakingRatio * 100
    const stakingRatioDeltaRaw = deltaFromPrev(
      currentSnapshot.stakingRatio,
      prev?.stakingRatio
    )
    const stakingRatioDelta =
      stakingRatioDeltaRaw === undefined ? undefined : stakingRatioDeltaRaw * 100

    return [
      {
        key: "luncCirc",
        label: "LUNC Circulating Supply",
        value: formatValue(currentSnapshot.circulatingLunc, 0),
        unit: "LUNC",
        size: "large",
        group: "lunc",
        delta: formatDelta(deltaFromPrev(currentSnapshot.circulatingLunc, prev?.circulatingLunc), 0, "LUNC"),
        deltaRaw: deltaFromPrev(currentSnapshot.circulatingLunc, prev?.circulatingLunc)
      },
      {
        key: "ustcCirc",
        label: "USTC Circulating Supply",
        value: formatValue(currentSnapshot.circulatingUstc, 0),
        unit: "USTC",
        size: "large",
        group: "ustc",
        delta: formatDelta(deltaFromPrev(currentSnapshot.circulatingUstc, prev?.circulatingUstc), 0, "USTC"),
        deltaRaw: deltaFromPrev(currentSnapshot.circulatingUstc, prev?.circulatingUstc)
      },
      {
        key: "luncPrice",
        label: "LUNC Price",
        value: formatUsdSmart(luncPrice),
        delta: luncChange === undefined ? undefined : formatPercent(luncChange),
        deltaRaw: luncChange
      },
      {
        key: "ustcPrice",
        label: "USTC Price",
        value: formatUsdSmart(ustcPrice),
        delta: ustcChange === undefined ? undefined : formatPercent(ustcChange),
        deltaRaw: ustcChange
      },
      {
        key: "luncMarketCap",
        label: "LUNC Market Cap",
        value: formatUsdStandard(luncMarketCap),
        delta: luncChange === undefined ? undefined : formatPercent(luncChange),
        deltaRaw: luncChange
      },
      {
        key: "ustcMarketCap",
        label: "USTC Market Cap",
        value: formatUsdStandard(ustcMarketCap),
        delta: ustcChange === undefined ? undefined : formatPercent(ustcChange),
        deltaRaw: ustcChange
      },
      {
        key: "luncTotal",
        label: "LUNC Total Supply",
        value: formatValue(currentSnapshot.luncSupply, 0),
        unit: "LUNC",
        group: "lunc",
        delta: formatDelta(deltaFromPrev(currentSnapshot.luncSupply, prev?.luncSupply), 0, "LUNC"),
        deltaRaw: deltaFromPrev(currentSnapshot.luncSupply, prev?.luncSupply)
      },
      {
        key: "ustcTotal",
        label: "USTC Total Supply",
        value: formatValue(currentSnapshot.ustcSupply, 0),
        unit: "USTC",
        group: "ustc",
        delta: formatDelta(deltaFromPrev(currentSnapshot.ustcSupply, prev?.ustcSupply), 0, "USTC"),
        deltaRaw: deltaFromPrev(currentSnapshot.ustcSupply, prev?.ustcSupply)
      },
      {
        key: "communityPoolLunc",
        label: "Community Pool (LUNC)",
        value: formatValue(currentSnapshot.luncCommunity, 2),
        unit: "LUNC",
        delta: formatDelta(deltaFromPrev(currentSnapshot.luncCommunity, prev?.luncCommunity), 2, "LUNC"),
        deltaRaw: deltaFromPrev(currentSnapshot.luncCommunity, prev?.luncCommunity)
      },
      {
        key: "communityPoolUstc",
        label: "Community Pool (USTC)",
        value: formatValue(currentSnapshot.ustcCommunity, 2),
        unit: "USTC",
        delta: formatDelta(deltaFromPrev(currentSnapshot.ustcCommunity, prev?.ustcCommunity), 2, "USTC"),
        deltaRaw: deltaFromPrev(currentSnapshot.ustcCommunity, prev?.ustcCommunity)
      },
      {
        key: "stakingRatio",
        label: "Staking Ratio",
        value: formatValue(stakingRatio, 2),
        unit: "%",
        delta: formatDelta(stakingRatioDelta, 2, "%"),
        deltaRaw: stakingRatioDelta
      },
      {
        key: "oraclePoolLunc",
        label: "Oracle Pool (LUNC)",
        value: formatValue(currentSnapshot.luncOracle, 2),
        unit: "LUNC",
        delta: formatOracleDelta(deltaFromPrev(currentSnapshot.luncOracle, prev?.luncOracle), "LUNC"),
        deltaRaw: deltaFromPrev(currentSnapshot.luncOracle, prev?.luncOracle)
      },
      {
        key: "oraclePoolUstc",
        label: "Oracle Pool (USTC)",
        value: formatValue(currentSnapshot.ustcOracle, 2),
        unit: "USTC",
        delta: formatOracleDelta(deltaFromPrev(currentSnapshot.ustcOracle, prev?.ustcOracle), "USTC"),
        deltaRaw: deltaFromPrev(currentSnapshot.ustcOracle, prev?.ustcOracle)
      },
      {
        key: "stakedLunc",
        label: "Total Staked",
        value: formatValue(currentSnapshot.stakedLunc, 0),
        unit: "LUNC",
        size: "large",
        delta: formatDelta(deltaFromPrev(currentSnapshot.stakedLunc, prev?.stakedLunc), 0, "LUNC"),
        deltaRaw: deltaFromPrev(currentSnapshot.stakedLunc, prev?.stakedLunc)
      },
      {
        key: "validators",
        label: "Active Validators",
        value: currentSnapshot.activeValidators
          ? `${formatNumber(currentSnapshot.activeValidators, 0)} / ${formatNumber(
              currentSnapshot.maxValidators ?? 0,
              0
            )}`
          : "--",
        delta: undefined,
        deltaRaw: undefined
      },
      {
        key: "unbonding",
        label: "Unbonding Period",
        value: currentSnapshot.unbondingTimeSec
          ? `${formatNumber(currentSnapshot.unbondingTimeSec / 86400, 0)} days`
          : "--",
        delta: undefined,
        deltaRaw: undefined
      },
      {
        key: "blockHeight",
        label: "Block Height",
        value: currentSnapshot.blockHeight
          ? formatNumber(currentSnapshot.blockHeight, 0)
          : "--",
        delta: undefined,
        deltaRaw: undefined
      },
      {
        key: "blockTime",
        label: "Block time",
        value: currentSnapshot.blockTimeMs
          ? formatBlockInterval(currentSnapshot.blockTimeMs)
          : "--",
        delta: undefined,
        deltaRaw: undefined
      }
    ]
  }, [
    currentSnapshot,
    dashboardRange,
    previousSnapshot,
    prices?.lunc?.usd,
    prices?.lunc?.usd_1h_change,
    prices?.lunc?.usd_24h_change,
    prices?.lunc?.usd_7d_change,
    prices?.ustc?.usd,
    prices?.ustc?.usd_1h_change,
    prices?.ustc?.usd_24h_change,
    prices?.ustc?.usd_7d_change
  ])

  const hasMetrics = metrics.length > 0

  return (
    <PageShell
      title="Dashboard"
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
            >
              {dashboardRanges[range].label}
            </button>
          ))}
        </div>
      }
    >
      <div className={styles.page}>
        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div>
              <div className={styles.sectionHeader}>Market</div>
              <p className={styles.sectionSubtext}>
                Showing {activeRange.label} price changes and chain deltas
                {previousSnapshotLoading ? "..." : "."}
              </p>
            </div>
          </div>
          <div className={styles.metricsTop}>
            {hasMetrics
              ? metrics
              .filter(
                (item) =>
                  item.key === "luncPrice" ||
                  item.key === "ustcPrice" ||
                  item.key === "luncMarketCap" ||
                  item.key === "ustcMarketCap"
              )
              .map((item) => (
                <DashboardMetricCard key={item.key} item={item} forceLarge />
              ))
              : <DashboardMetricSkeletons count={4} large />}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Supply</div>
          <div className={styles.metricsSupply}>
            {hasMetrics
              ? metrics
              .filter(
                (item) =>
                  item.key === "luncCirc" ||
                  item.key === "luncTotal" ||
                  item.key === "ustcCirc" ||
                  item.key === "ustcTotal"
              )
              .map((item) => (
                <DashboardMetricCard key={item.key} item={item} />
              ))
              : <DashboardMetricSkeletons count={4} large />}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Treasury</div>
          <div className={styles.metricsSupply}>
            {hasMetrics
              ? metrics
              .filter(
                (item) =>
                  item.key === "communityPoolLunc" ||
                  item.key === "communityPoolUstc" ||
                  item.key === "oraclePoolLunc" ||
                  item.key === "oraclePoolUstc"
              )
              .map((item) => (
                <DashboardMetricCard key={item.key} item={item} />
              ))
              : <DashboardMetricSkeletons count={4} />}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Staking</div>
          <div className={styles.metrics}>
            {hasMetrics
              ? metrics
              .filter(
                (item) =>
                  item.key === "stakedLunc" ||
                  item.key === "stakingRatio" ||
                  item.key === "unbonding"
              )
              .sort((a, b) => {
                const rank = (item: { key: string }) => {
                  if (item.key === "stakedLunc") return 0
                  if (item.key === "stakingRatio") return 1
                  if (item.key === "unbonding") return 2
                  return 9
                }
                return rank(a) - rank(b)
              })
              .map((item) => (
                <DashboardMetricCard key={item.key} item={item} />
              ))
              : <DashboardMetricSkeletons count={3} />}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Chain</div>
          <div className={styles.metrics}>
            {hasMetrics
              ? metrics
              .filter(
                (item) =>
                  item.key === "blockHeight" ||
                  item.key === "blockTime" ||
                  item.key === "validators"
              )
              .map((item) => (
                <DashboardMetricCard key={item.key} item={item} />
              ))
              : <DashboardMetricSkeletons count={3} />}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div>
              <div className={styles.sectionHeader}>Network Activity</div>
              <p className={styles.sectionSubtext}>
                Latest {activeRange.label} bucket from BiNodes. Updated:{" "}
                {formatUtcHour(activityTimestamp)}
              </p>
            </div>
            <div className={styles.poweredByLine}>
              {activityLoading
                ? "Loading BiNodes"
                : activityError
                  ? "BiNodes unavailable"
                : "Powered by BiNodes"}
            </div>
          </div>
          <div className={styles.metrics}>
            <div className={`card ${styles.metricCard}`}>
              <div className={styles.metricLabel}>Total Fee Accrued</div>
              <div className={styles.metricValue}>
                {formatUsdCompact(activityLatest?.totalFeeUsd)}
              </div>
              <div className={`${styles.delta} ${styles.neutral}`}>
                Includes gas, pool fees, and burn tax
              </div>
            </div>
            <div className={`card ${styles.metricCard}`}>
              <div className={styles.metricLabel}>Total Transactions</div>
              <div className={styles.metricValue}>
                {formatValue(activityLatest?.txTotalCnt, 0)}
              </div>
              <div className={`${styles.delta} ${styles.neutral}`}>
                Latest {activeRange.label} transaction count
              </div>
            </div>
            <div className={`card ${styles.metricCard}`}>
              <div className={styles.metricLabel}>Burn</div>
              <div className={styles.metricValue}>
                {formatUsdCompact(activityLatest?.burnUsd)}
              </div>
              <div className={`${styles.delta} ${styles.neutral}`}>
                Fee burn and voluntary burn
              </div>
            </div>
          </div>
        </section>

      </div>
    </PageShell>
  )
}

export default Dashboard
