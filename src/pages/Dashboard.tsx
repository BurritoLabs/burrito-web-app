import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./Dashboard.module.css"
import {
  buildTxVolumeSeries,
  fetchTxCountBuckets,
  fetchCurrentDashboardSnapshot,
  fetchHistoricalDashboardSnapshot,
  fetchTxVolume
} from "../app/data/dashboard"
import { formatNumber } from "../app/utils/format"

const RANGE_CONFIG = {
  "1h": {
    ms: 60 * 60 * 1000,
    ttl: 2 * 60 * 1000,
    bucketMs: 5 * 60 * 1000,
    maxPages: 200
  },
  "24h": {
    ms: 24 * 60 * 60 * 1000,
    ttl: 10 * 60 * 1000,
    bucketMs: 60 * 60 * 1000,
    maxPages: 600
  },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, ttl: 6 * 60 * 60 * 1000 }
} as const

type RangeKey = keyof typeof RANGE_CONFIG

const formatValue = (value?: number, decimals = 2) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return formatNumber(value, decimals)
}

const formatDelta = (value?: number, decimals = 2, unit?: string) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const sign = value >= 0 ? "+" : ""
  const suffix = unit ? ` ${unit}` : ""
  return `${sign}${formatNumber(value, decimals)}${suffix}`
}

const formatDateLabel = (time?: number) => {
  if (!time) return ""
  const date = new Date(time)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit"
  })
}

const formatTimeLabel = (time?: number) => {
  if (!time) return ""
  const date = new Date(time)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  })
}

const formatAxisLabel = (range: RangeKey, time?: number) => {
  if (range === "7d") return formatDateLabel(time)
  return formatTimeLabel(time)
}

const Dashboard = () => {
  const [range, setRange] = useState<RangeKey>("24h")
  const config = RANGE_CONFIG[range]

  const { data: currentSnapshot } = useQuery({
    queryKey: ["dashboard", "snapshot", "current"],
    queryFn: fetchCurrentDashboardSnapshot,
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000
  })

  const { data: previousSnapshot } = useQuery({
    queryKey: ["dashboard", "snapshot", range],
    queryFn: () =>
      fetchHistoricalDashboardSnapshot(range, config.ms, config.ttl),
    staleTime: config.ttl
  })

  const { data: txVolume = [] } = useQuery({
    queryKey: ["dashboard", "txVolume"],
    queryFn: fetchTxVolume,
    select: buildTxVolumeSeries,
    staleTime: 10 * 60 * 1000
  })

  const { data: txCounts = [] } = useQuery({
    queryKey: ["dashboard", "txCounts", range],
    queryFn: () =>
      fetchTxCountBuckets(
        config.ms,
        "bucketMs" in config ? config.bucketMs : config.ms,
        config.ttl,
        "maxPages" in config ? config.maxPages : 40
      ),
    staleTime: config.ttl,
    enabled: range === "1h"
  })

  const metrics = useMemo(() => {
    if (!currentSnapshot) return []
    const prev = previousSnapshot

    const stakingRatio = currentSnapshot.stakingRatio * 100
    const stakingRatioDelta = prev
      ? (currentSnapshot.stakingRatio - prev.stakingRatio) * 100
      : undefined

    return [
      {
        key: "luncCirc",
        label: "LUNC Circulating Supply",
        value: formatValue(currentSnapshot.circulatingLunc, 0),
        unit: "LUNC",
        delta: formatDelta(
          prev ? currentSnapshot.circulatingLunc - prev.circulatingLunc : undefined,
          0,
          "LUNC"
        ),
        deltaRaw: prev ? currentSnapshot.circulatingLunc - prev.circulatingLunc : undefined
      },
      {
        key: "ustcCirc",
        label: "USTC Circulating Supply",
        value: formatValue(currentSnapshot.circulatingUstc, 0),
        unit: "USTC",
        delta: formatDelta(
          prev ? currentSnapshot.circulatingUstc - prev.circulatingUstc : undefined,
          0,
          "USTC"
        ),
        deltaRaw: prev ? currentSnapshot.circulatingUstc - prev.circulatingUstc : undefined
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
        key: "luncTotal",
        label: "LUNC Total Supply",
        value: formatValue(currentSnapshot.luncSupply, 0),
        unit: "LUNC",
        delta: formatDelta(
          prev ? currentSnapshot.luncSupply - prev.luncSupply : undefined,
          0,
          "LUNC"
        ),
        deltaRaw: prev ? currentSnapshot.luncSupply - prev.luncSupply : undefined
      },
      {
        key: "ustcTotal",
        label: "USTC Total Supply",
        value: formatValue(currentSnapshot.ustcSupply, 0),
        unit: "USTC",
        delta: formatDelta(
          prev ? currentSnapshot.ustcSupply - prev.ustcSupply : undefined,
          0,
          "USTC"
        ),
        deltaRaw: prev ? currentSnapshot.ustcSupply - prev.ustcSupply : undefined
      },
      {
        key: "communityPool",
        label: "Community Pool",
        value: formatValue(currentSnapshot.luncCommunity, 2),
        unit: "LUNC",
        delta: formatDelta(
          prev ? currentSnapshot.luncCommunity - prev.luncCommunity : undefined,
          2,
          "LUNC"
        ),
        deltaRaw: prev ? currentSnapshot.luncCommunity - prev.luncCommunity : undefined
      }
    ]
  }, [currentSnapshot, previousSnapshot])

  const volumeLast24h = useMemo(() => {
    if (!txVolume.length) return 0
    const sorted = [...txVolume].sort((a, b) => a.time - b.time)
    const latest = sorted[sorted.length - 1]
    const previous = sorted[sorted.length - 2]
    if (!latest) return 0

    const now = Date.now()
    const startOfDay = new Date(now)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const hoursIntoDay = Math.min(
      24,
      Math.max(0, (now - startOfDay.getTime()) / (60 * 60 * 1000))
    )
    const todayVolume = latest.value
    const prevVolume = previous ? previous.value : latest.value
    const todayPart = todayVolume * (hoursIntoDay / 24)
    const prevPart = prevVolume * ((24 - hoursIntoDay) / 24)
    return todayPart + prevPart
  }, [txVolume])

  const series = useMemo(() => {
    if (!txVolume.length) return []
    const now = Date.now()
    const start = now - config.ms

    if (range === "7d") {
      return txVolume
        .filter((point) => point.time >= start)
        .slice(-7)
        .map((point) => ({
          time: point.time,
          value: point.value
        }))
    }

    if (range === "24h") {
      const bucketMs = 60 * 60 * 1000
      const hourlyValue = volumeLast24h ? volumeLast24h / 24 : 0
      return Array.from({ length: 24 }, (_, index) => ({
        time: start + index * bucketMs,
        value: hourlyValue
      }))
    }

    if (!txCounts.length) return []

    const totalCount = txCounts.reduce((sum, count) => sum + count, 0)
    const totalVolume = volumeLast24h ? volumeLast24h / 24 : 0
    const bucketMs = "bucketMs" in config ? config.bucketMs : config.ms

    return txCounts.map((count, index) => ({
      time: start + index * bucketMs,
      value: totalCount > 0 ? totalVolume * (count / totalCount) : 0
    }))
  }, [txVolume, txCounts, range, config, volumeLast24h])

  const maxVolume = useMemo(() => {
    if (!series.length) return 1
    return Math.max(...series.map((point) => point.value), 1)
  }, [series])

  const rangeSwitch = (
    <div className={styles.rangeSwitch}>
      {(Object.keys(RANGE_CONFIG) as RangeKey[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`${styles.rangeButton} ${
            range === key ? styles.rangeButtonActive : ""
          }`}
          onClick={() => setRange(key)}
        >
          {key}
        </button>
      ))}
    </div>
  )

  return (
    <PageShell title="Dashboard" extra={rangeSwitch}>
      <div className={styles.page}>
        <div className={styles.metrics}>
          {metrics.map((item) => (
            <div key={item.key} className={`card ${styles.metricCard}`}>
              <div className={styles.metricLabel}>{item.label}</div>
              <div className={styles.metricValue}>
                {item.value}
                {item.unit ? <span>{item.unit}</span> : null}
              </div>
              <div
                className={`${styles.delta} ${
                  item.deltaRaw === undefined
                    ? styles.neutral
                    : item.deltaRaw >= 0
                      ? styles.up
                      : styles.down
                }`}
              >
                {item.delta}
              </div>
            </div>
          ))}
        </div>

        <div className={`card ${styles.chartCard}`}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>Transaction volume</div>
          </div>
          <div className={styles.chart}>
            {series.length ? (
              <div className={styles.chartBars}>
                {series.map((point, index) => {
                  const height = Math.max(6, (point.value / maxVolume) * 100)
                  return (
                    <div
                      key={`${point.time}-${index}`}
                      className={styles.chartBar}
                      style={{ height: `${height}%` }}
                      title={`${formatNumber(point.value, 0)} LUNC`}
                    />
                  )
                })}
              </div>
            ) : (
              <div className={styles.chartEmpty}>No data available</div>
            )}
            <div className={styles.chartAxis}>
              <span>{formatAxisLabel(range, series[0]?.time)}</span>
              <span>
                {formatAxisLabel(range, series[series.length - 1]?.time)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

export default Dashboard
