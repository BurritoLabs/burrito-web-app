import type { RefObject } from "react"
import type { PairCandle } from "../../app/data/market"
import { formatChartAxisPrice, formatCandleVolume, type Timeframe } from "../../app/market/pairChart"
import detailStyles from "../MarketPairDetails.module.css"
import styles from "./MarketPairChartPanel.module.css"

type MarketPairChartPanelProps = {
  activeCandle: PairCandle | undefined
  candleTimeLabel: string
  chartHostRef: RefObject<HTMLDivElement | null>
  chartPairLabel: string
  chartTooltipRef: RefObject<HTMLDivElement | null>
  hasCandles: boolean
  isCandlesEnabled: boolean
  isCandlesError: boolean
  isCandlesLoading: boolean
  latestObservedSwapAt?: number
  onResetView: () => void
  onRetryCandles: () => void
  onTimeframeChange: (timeframe: Timeframe) => void
  quoteSymbol: string
  timeframe: Timeframe
}

const timeframes: Timeframe[] = ["1h", "24h", "7d"]
const bucketLabels: Record<Timeframe, string> = {
  "1h": "1m candles",
  "24h": "30m candles",
  "7d": "2h candles"
}

const observedSwapTime = (timestamp?: number) => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > 8.64e15) return null
  return {
    iso: new Date(timestamp).toISOString(),
    label: new Intl.DateTimeFormat("en", {
      month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC"
    }).format(timestamp)
  }
}

const MarketPairChartPanel = ({
  activeCandle,
  candleTimeLabel,
  chartHostRef,
  chartPairLabel,
  chartTooltipRef,
  hasCandles,
  isCandlesEnabled,
  isCandlesError,
  isCandlesLoading,
  latestObservedSwapAt,
  onResetView,
  onRetryCandles,
  onTimeframeChange,
  quoteSymbol,
  timeframe
}: MarketPairChartPanelProps) => {
  const latestSwap = observedSwapTime(latestObservedSwapAt)
  return (
  <section className={styles.chartSection} aria-label="Price chart">
    <header className={styles.chartHeader}>
      <div className={styles.chartHeading}>
        <h2 className={styles.chartTitle}>Price chart</h2>
        <span className={styles.quoteUnit}>{quoteSymbol}</span>
      </div>
      <div className={styles.chartToolbar}>
        <span className={styles.rangeLabel}>Range</span>
        <div className={styles.rangeButtons} role="group" aria-label="Chart range">
          {timeframes.map((item) => (
            <button
              key={item}
              type="button"
              className={`${styles.rangeButton} ${timeframe === item ? styles.rangeButtonActive : ""}`}
              aria-pressed={timeframe === item}
              onClick={() => onTimeframeChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.resetButton}
          onClick={onResetView}
          disabled={!hasCandles}
          aria-label="Reset chart view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10a8 8 0 1 1 .7 6M4 4v6h6" />
          </svg>
          Reset
        </button>
      </div>
    </header>

    <div className={styles.candleSummary} role="group" aria-label="Selected candle values">
      {activeCandle ? (
        <div className={styles.ohlcGrid}>
          <span className={styles.ohlcItem}><span>O</span><strong>{formatChartAxisPrice(activeCandle.open)}</strong></span>
          <span className={styles.ohlcItem}><span>H</span><strong>{formatChartAxisPrice(activeCandle.high)}</strong></span>
          <span className={styles.ohlcItem}><span>L</span><strong>{formatChartAxisPrice(activeCandle.low)}</strong></span>
          <span className={styles.ohlcItem}><span>C</span><strong>{formatChartAxisPrice(activeCandle.close)}</strong></span>
        </div>
      ) : (
        <span className={styles.noCandle}>No candle selected</span>
      )}
    </div>

    {!isCandlesEnabled ? (
      <div className={styles.chartFallback}>Chart unavailable until this pair has a valid price.</div>
    ) : isCandlesLoading && !hasCandles ? (
      <div className={styles.chartFallback}>Loading recent swaps...</div>
    ) : isCandlesError && !hasCandles ? (
      <div className={styles.chartFallback} role="alert">
        Could not load the price chart.
        <button type="button" onClick={onRetryCandles}>Try again</button>
      </div>
    ) : !hasCandles ? (
      <div className={styles.chartFallback}>
        <span>No observed swaps in this {timeframe} range.</span>
        {latestSwap ? (
          <span className={styles.lastObservedSwap}>
            Latest observed swap: <time dateTime={latestSwap.iso}>
              {latestSwap.label} UTC
            </time>
          </span>
        ) : null}
        {timeframe !== "7d" ? (
          <button type="button" onClick={() => onTimeframeChange(timeframe === "1h" ? "24h" : "7d")}>
            View {timeframe === "1h" ? "24h" : "7d"} history
          </button>
        ) : null}
      </div>
    ) : (
      <div className={styles.chartCanvas}>
        <div
          ref={chartHostRef}
          className={styles.chartHost}
          aria-label={`${chartPairLabel} ${timeframe} price chart`}
          role="group"
        />
        <div ref={chartTooltipRef} className={detailStyles.chartTooltip} />
      </div>
    )}

    <footer className={styles.chartFooter}>
      <span className={styles.bucketLabel}>{bucketLabels[timeframe]}</span>
      <span className={styles.candleVolume} title={activeCandle?.volumeKnown === false ? "Volume is unavailable in this quote asset." : undefined}>
        Volume <strong>{formatCandleVolume(activeCandle)}</strong> {quoteSymbol}
      </span>
      <span className={styles.candleTime}>{candleTimeLabel}</span>
    </footer>
  </section>
  )
}

export default MarketPairChartPanel
