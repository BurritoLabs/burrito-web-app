import styles from "../Dashboard.module.css"
import type { DashboardHistoryPoint } from "../../app/data/dashboardHistory"

type ChartPoint = DashboardHistoryPoint

const WIDTH = 640
const HEIGHT = 176
const LEFT = 12
const RIGHT = 12
const TOP = 12
const BOTTOM = 28

const compactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value)

const chartNumber = (value: number) =>
  Math.abs(value) < 1 && value !== 0
    ? value.toLocaleString("en-US", { maximumFractionDigits: 6 })
    : compactNumber(value)

const dateLabel = (time: number, hourly: boolean) =>
  new Date(time).toLocaleString("en-US",
    hourly
      ? { hour: "numeric" }
      : { month: "short", day: "numeric" }
  )

const normalized = (points: ChartPoint[]) =>
  points.filter(
    (point) => Number.isFinite(point.time) && Number.isFinite(point.value)
  )

const xAt = (index: number, total: number) =>
  LEFT + (index / Math.max(total - 1, 1)) * (WIDTH - LEFT - RIGHT)

const labelIndexes = (length: number) =>
  Array.from(new Set([0, Math.floor((length - 1) / 2), length - 1])).filter(
    (index) => index >= 0
  )

export const MiniTrend = ({
  points,
  color,
  label
}: {
  points: ChartPoint[]
  color: string
  label: string
}) => {
  const data = normalized(points)
  if (data.length < 2) return <div className={styles.chartUnavailable}>--</div>
  const values = data.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || Math.abs(max) * 0.02 || 1
  const polyline = data
    .map((point, index) => {
      const x = xAt(index, data.length)
      const y = TOP + ((max - point.value) / range) * (HEIGHT - TOP - BOTTOM)
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg className={styles.miniTrend} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      <line className={styles.chartGridLine} x1={LEFT} x2={WIDTH - RIGHT} y1={HEIGHT / 2} y2={HEIGHT / 2} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export const LineChart = ({
  points,
  color,
  label,
  valuePrefix = "",
  valueSuffix = ""
}: {
  points: ChartPoint[]
  color: string
  label: string
  valuePrefix?: string
  valueSuffix?: string
}) => {
  const data = normalized(points)
  if (data.length < 2) return <div className={styles.chartEmpty}>Historical data unavailable</div>
  const values = data.map((point) => point.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const padding = (rawMax - rawMin || Math.abs(rawMax) * 0.05 || 1) * 0.12
  const min = rawMin - padding
  const max = rawMax + padding
  const range = max - min || 1
  const polyline = data
    .map((point, index) => {
      const x = xAt(index, data.length)
      const y = TOP + ((max - point.value) / range) * (HEIGHT - TOP - BOTTOM)
      return `${x},${y}`
    })
    .join(" ")
  const hourly = data.at(-1)!.time - data[0]!.time <= 36 * 60 * 60 * 1000

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} className={styles.chartGridLine} x1={LEFT} x2={WIDTH - RIGHT} y1={TOP + ratio * (HEIGHT - TOP - BOTTOM)} y2={TOP + ratio * (HEIGHT - TOP - BOTTOM)} />
      ))}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {data.map((point, index) => {
        const x = xAt(index, data.length)
        const y = TOP + ((max - point.value) / range) * (HEIGHT - TOP - BOTTOM)
        return <circle key={`${point.time}-${index}`} cx={x} cy={y} r="7" fill="transparent"><title>{`${dateLabel(point.time, hourly)}: ${valuePrefix}${chartNumber(point.value)}${valueSuffix}`}</title></circle>
      })}
      {labelIndexes(data.length).map((index) => (
        <text key={index} className={styles.chartAxisLabel} x={xAt(index, data.length)} y={HEIGHT - 5} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}>{dateLabel(data[index].time, hourly)}</text>
      ))}
    </svg>
  )
}

export const BarChart = ({
  points,
  color,
  label,
  valuePrefix = ""
}: {
  points: ChartPoint[]
  color: string
  label: string
  valuePrefix?: string
}) => {
  const data = normalized(points)
  if (!data.length) return <div className={styles.chartEmpty}>Historical data unavailable</div>
  const max = Math.max(...data.map((point) => point.value), 1)
  const plotWidth = WIDTH - LEFT - RIGHT
  const slot = plotWidth / data.length
  const barWidth = Math.max(2, Math.min(38, slot * 0.64))
  const hourly = data.at(-1)!.time - data[0]!.time <= 36 * 60 * 60 * 1000

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} className={styles.chartGridLine} x1={LEFT} x2={WIDTH - RIGHT} y1={TOP + ratio * (HEIGHT - TOP - BOTTOM)} y2={TOP + ratio * (HEIGHT - TOP - BOTTOM)} />
      ))}
      {data.map((point, index) => {
        const height = (point.value / max) * (HEIGHT - TOP - BOTTOM)
        const x = LEFT + index * slot + (slot - barWidth) / 2
        const y = HEIGHT - BOTTOM - height
        return <rect key={`${point.time}-${index}`} x={x} y={y} width={barWidth} height={height} rx="1.5" fill={color}><title>{`${dateLabel(point.time, hourly)}: ${valuePrefix}${compactNumber(point.value)}`}</title></rect>
      })}
      {labelIndexes(data.length).map((index) => (
        <text key={index} className={styles.chartAxisLabel} x={xAt(index, data.length)} y={HEIGHT - 5} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}>{dateLabel(data[index].time, hourly)}</text>
      ))}
    </svg>
  )
}

export const GroupedBurnChart = ({
  points,
  label
}: {
  points: Array<ChartPoint & { secondaryValue: number }>
  label: string
}) => {
  const data = points.filter(
    (point) =>
      Number.isFinite(point.time) &&
      Number.isFinite(point.value) &&
      Number.isFinite(point.secondaryValue)
  )
  if (!data.length) return <div className={styles.chartEmpty}>Historical data unavailable</div>
  const max = Math.max(...data.flatMap((point) => [point.value, point.secondaryValue]), 1)
  const plotWidth = WIDTH - LEFT - RIGHT
  const slot = plotWidth / data.length
  const groupWidth = Math.max(5, Math.min(44, slot * 0.7))
  const gap = Math.max(1.5, groupWidth * 0.06)
  const barWidth = (groupWidth - gap) / 2
  const hourly = data.at(-1)!.time - data[0]!.time <= 36 * 60 * 60 * 1000

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} className={styles.chartGridLine} x1={LEFT} x2={WIDTH - RIGHT} y1={TOP + ratio * (HEIGHT - TOP - BOTTOM)} y2={TOP + ratio * (HEIGHT - TOP - BOTTOM)} />
      ))}
      {data.map((point, index) => {
        const groupX = LEFT + index * slot + (slot - groupWidth) / 2
        return ([
          { value: point.value, color: "var(--dashboard-lunc)", name: "LUNC", x: groupX },
          { value: point.secondaryValue, color: "var(--dashboard-ustc)", name: "USTC", x: groupX + barWidth + gap }
        ]).map((bar) => {
          const height = (bar.value / max) * (HEIGHT - TOP - BOTTOM)
          return <rect key={`${point.time}-${bar.name}`} x={bar.x} y={HEIGHT - BOTTOM - height} width={barWidth} height={height} rx="1.5" fill={bar.color}><title>{`${dateLabel(point.time, hourly)} ${bar.name}: $${compactNumber(bar.value)}`}</title></rect>
        })
      })}
      {labelIndexes(data.length).map((index) => (
        <text key={index} className={styles.chartAxisLabel} x={xAt(index, data.length)} y={HEIGHT - 5} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}>{dateLabel(data[index].time, hourly)}</text>
      ))}
    </svg>
  )
}
