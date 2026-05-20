import type { RefObject } from "react"
import type { PairCandle } from "../../app/data/market"
import {
  formatAxisPrice,
  formatChartUsdPerBase,
  type Timeframe
} from "../../app/market/pairChart"
import { formatNumber, formatPercent } from "../../app/utils/format"
import styles from "../MarketPairDetails.module.css"

type MarketPairChartPanelProps = {
  activeCandle: PairCandle | undefined
  baseSymbol: string
  candleChange: number | undefined
  candleTimeLabel: string
  chartHostRef: RefObject<HTMLDivElement | null>
  chartPairLabel: string
  chartQuoteUsd: number | undefined
  chartTooltipRef: RefObject<HTMLDivElement | null>
  hasCandles: boolean
  isCandlesLoading: boolean
  quoteSymbol: string
  timeframe: Timeframe
}

const MarketPairChartPanel = ({
  activeCandle,
  baseSymbol,
  candleChange,
  candleTimeLabel,
  chartHostRef,
  chartPairLabel,
  chartQuoteUsd,
  chartTooltipRef,
  hasCandles,
  isCandlesLoading,
  quoteSymbol,
  timeframe
}: MarketPairChartPanelProps) => (
  <section className={`card ${styles.chartSection}`}>
    <header className={styles.chartHeader}>
      <span className={styles.sectionTitle}>Price chart</span>
      <span className={styles.chartSymbol}>{candleTimeLabel}</span>
    </header>
    <header className={styles.ohlcHeader}>
      {activeCandle ? (
        <>
          <span>O {formatAxisPrice(activeCandle.open)} {quoteSymbol}</span>
          <span>H {formatAxisPrice(activeCandle.high)} {quoteSymbol}</span>
          <span>L {formatAxisPrice(activeCandle.low)} {quoteSymbol}</span>
          <span>C {formatAxisPrice(activeCandle.close)} {quoteSymbol}</span>
          <span>Vol {formatNumber(activeCandle.volumeQuote, 2)} {quoteSymbol}</span>
          <span className={styles.ohlcFlat}>
            {formatChartUsdPerBase(activeCandle.close, chartQuoteUsd, baseSymbol)}
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
    {isCandlesLoading && !hasCandles ? (
      <div className={styles.chartFallback}>Loading recent swaps...</div>
    ) : !hasCandles ? (
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
)

export default MarketPairChartPanel
