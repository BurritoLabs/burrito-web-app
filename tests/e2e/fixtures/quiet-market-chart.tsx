import { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import "@burritolabs/ui/tokens.css"
import "../../../src/index.css"
import MarketPairChartPanel from "../../../src/pages/market/MarketPairChartPanel"
import detailStyles from "../../../src/pages/MarketPairDetails.module.css"
import type { Timeframe } from "../../../src/app/market/pairChart"

// Component-only acceptance fixture: no wallet, network data, or transaction.
document.title = "Quiet market chart QA fixture"
const params = new URLSearchParams(window.location.search)

export function Fixture() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1h")
  const chartHostRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const failed = params.has("failed")
  const hasCandles = timeframe !== "1h" && !failed
  return (
    <main className={detailStyles.detailPage} style={{ maxWidth: 800, margin: "24px auto", padding: "0 16px" }}>
      <h1>Quiet market chart QA fixture</h1>
      <MarketPairChartPanel
        activeCandle={hasCandles ? { bucketStart: 1_793_916_480_000, open: 0.00996, high: 0.00998, low: 0.00995, close: 0.00997, volumeQuote: 25 } : undefined}
        candleTimeLabel={hasCandles ? "Nov 05, 22:08" : "LUNC/USTC"}
        chartHostRef={chartHostRef}
        chartPairLabel="LUNC/USTC"
        chartTooltipRef={tooltipRef}
        hasCandles={hasCandles}
        isCandlesEnabled
        isCandlesError={failed}
        isCandlesLoading={false}
        latestObservedSwapAt={params.has("unknown") ? undefined : Date.parse("2026-11-05T22:08:21Z")}
        onResetView={() => undefined}
        onRetryCandles={() => undefined}
        onTimeframeChange={setTimeframe}
        quoteSymbol="USTC"
        timeframe={timeframe}
      />
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Fixture />)
