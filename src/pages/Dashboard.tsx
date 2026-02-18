import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./Dashboard.module.css"
import {
  fetchCurrentDashboardSnapshot,
  type DashboardSnapshot
} from "../app/data/dashboard"
import { fetchPrices } from "../app/data/classic"
import { formatNumber, formatPercent } from "../app/utils/format"

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

const formatUsdSmart = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const decimals = abs < 0.01 ? 6 : abs < 1 ? 4 : 2
  return `$${formatNumber(value, decimals)}`
}

const formatUsdStandard = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  return `$${formatNumber(value, 2)}`
}

const formatOracleDelta = (value?: number, unit?: string) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "--"
  const abs = Math.abs(value)
  const decimals = abs < 1 ? 6 : abs < 100 ? 4 : 2
  return formatDelta(value, decimals, unit)
}

const formatBlockInterval = (ms?: number) => {
  if (!ms || ms <= 0) return "--"
  return `${formatNumber(ms / 1000, 2)} s`
}

const DeltaUpIcon = () => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 1.6C8.15828 1.6 7.80011 1.24183 7.80011 0.8C7.80011 0.358172 8.15828 0 8.60011 0H12.6001C13.0419 0 13.4001 0.358172 13.4001 0.8V4.8C13.4001 5.24183 13.0419 5.6 12.6001 5.6C12.1583 5.6 11.8001 5.24183 11.8001 4.8V2.73137L8.36579 6.16569C8.05337 6.47811 7.54684 6.47811 7.23442 6.16569L5.4001 4.33137L1.96578 7.76569C1.65336 8.0781 1.14683 8.0781 0.834412 7.76569C0.521993 7.45327 0.521993 6.94673 0.834412 6.63432L4.83442 2.63431C5.14684 2.3219 5.65337 2.3219 5.96579 2.63431L7.80011 4.46863L10.6687 1.6H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

const DeltaDownIcon = () => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 6.4C8.15828 6.4 7.80011 6.75817 7.80011 7.2C7.80011 7.64183 8.15828 8 8.60011 8H12.6001C13.0419 8 13.4001 7.64183 13.4001 7.2V3.2C13.4001 2.75817 13.0419 2.4 12.6001 2.4C12.1583 2.4 11.8001 2.75817 11.8001 3.2V5.26863L8.36579 1.83431C8.05337 1.52189 7.54684 1.52189 7.23442 1.83431L5.4001 3.66863L1.96578 0.234314C1.65336 -0.078105 1.14683 -0.078105 0.834412 0.234314C0.521993 0.546734 0.521993 1.05327 0.834412 1.36568L4.83442 5.36569C5.14684 5.6781 5.65337 5.6781 5.96579 5.36569L7.80011 3.53137L10.6687 6.4H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

type MetricLayout = "wide" | "tall"
type MetricSize = "large"

type MetricItem = {
  key: string
  label: string
  value: string
  unit?: string
  size?: MetricSize
  group?: string
  delta?: string
  deltaRaw?: number
  layout?: MetricLayout
}

const Dashboard = () => {
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

  const metrics = useMemo<MetricItem[]>(() => {
    if (!currentSnapshot) return []
    let prev: DashboardSnapshot | undefined
    const deltaFromPrev = (current: number, previous?: number) =>
      previous === undefined ? undefined : current - previous

    const luncPrice = prices?.lunc?.usd
    const ustcPrice = prices?.ustc?.usd
    const luncChange = prices?.lunc?.usd_24h_change
    const ustcChange = prices?.ustc?.usd_24h_change
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
  }, [currentSnapshot, prices?.lunc?.usd, prices?.ustc?.usd])

  return (
    <PageShell title="Dashboard">
      <div className={styles.page}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>Market</div>
          <div className={styles.metricsTop}>
            {metrics
              .filter(
                (item) =>
                  item.key === "luncPrice" ||
                  item.key === "ustcPrice" ||
                  item.key === "luncMarketCap" ||
                  item.key === "ustcMarketCap"
              )
              .map((item) => (
                <div key={item.key} className={`card ${styles.metricCard} ${styles.metricCardLarge}`}>
                  <div className={styles.metricLabel}>{item.label}</div>
                  <div className={styles.metricValue}>
                    {item.value}
                    {item.unit ? <span>{item.unit}</span> : null}
                  </div>
                  {item.delta !== undefined && item.delta !== "--" ? (
                    <div
                      className={`${styles.delta} ${
                        item.deltaRaw === undefined
                          ? styles.neutral
                          : item.deltaRaw >= 0
                            ? styles.up
                            : styles.down
                      }`}
                    >
                      {item.deltaRaw === undefined ? null : item.deltaRaw >= 0 ? (
                        <DeltaUpIcon />
                      ) : (
                        <DeltaDownIcon />
                      )}
                      {item.delta}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Supply</div>
          <div className={styles.metricsSupply}>
            {metrics
              .filter(
                (item) =>
                  item.key === "luncCirc" ||
                  item.key === "luncTotal" ||
                  item.key === "ustcCirc" ||
                  item.key === "ustcTotal"
              )
              .map((item) => (
                <div
                  key={item.key}
                  className={`card ${styles.metricCard} ${
                    item.size === "large" ? styles.metricCardLarge : ""
                  } ${
                    item.layout === "wide"
                      ? styles.metricWide
                      : item.layout === "tall"
                        ? styles.metricTall
                        : ""
                  }`}
                >
                  <div className={styles.metricLabel}>{item.label}</div>
                  <div className={styles.metricValue}>
                    {item.value}
                    {item.unit ? <span>{item.unit}</span> : null}
                  </div>
                  {item.delta !== undefined && item.delta !== "--" ? (
                    <div
                      className={`${styles.delta} ${
                        item.deltaRaw === undefined
                          ? styles.neutral
                          : item.deltaRaw >= 0
                            ? styles.up
                            : styles.down
                      }`}
                    >
                      {item.deltaRaw === undefined ? null : item.deltaRaw >= 0 ? (
                        <DeltaUpIcon />
                      ) : (
                        <DeltaDownIcon />
                      )}
                      {item.delta}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Treasury</div>
          <div className={styles.metricsTwo}>
            {metrics
              .filter(
                (item) =>
                  item.key === "communityPoolLunc" ||
                  item.key === "communityPoolUstc" ||
                  item.key === "oraclePoolLunc" ||
                  item.key === "oraclePoolUstc"
              )
              .map((item) => (
                <div
                  key={item.key}
                  className={`card ${styles.metricCard} ${
                    item.size === "large" ? styles.metricCardLarge : ""
                  } ${
                    item.layout === "wide"
                      ? styles.metricWide
                      : item.layout === "tall"
                        ? styles.metricTall
                        : ""
                  }`}
                >
                  <div className={styles.metricLabel}>{item.label}</div>
                  <div className={styles.metricValue}>
                    {item.value}
                    {item.unit ? <span>{item.unit}</span> : null}
                  </div>
                  {item.delta !== undefined && item.delta !== "--" ? (
                    <div
                      className={`${styles.delta} ${
                        item.deltaRaw === undefined
                          ? styles.neutral
                          : item.deltaRaw >= 0
                            ? styles.up
                            : styles.down
                      }`}
                    >
                      {item.deltaRaw === undefined ? null : item.deltaRaw >= 0 ? (
                        <DeltaUpIcon />
                      ) : (
                        <DeltaDownIcon />
                      )}
                      {item.delta}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Staking</div>
          <div className={styles.metrics}>
            {metrics
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
                <div
                  key={item.key}
                  className={`card ${styles.metricCard} ${
                    item.size === "large" ? styles.metricCardLarge : ""
                  } ${
                    item.layout === "wide"
                      ? styles.metricWide
                      : item.layout === "tall"
                        ? styles.metricTall
                        : ""
                  }`}
                >
                  <div className={styles.metricLabel}>{item.label}</div>
                  <div className={styles.metricValue}>
                    {item.value}
                    {item.unit ? <span>{item.unit}</span> : null}
                  </div>
                  {item.delta !== undefined && item.delta !== "--" ? (
                    <div
                      className={`${styles.delta} ${
                        item.deltaRaw === undefined
                          ? styles.neutral
                          : item.deltaRaw >= 0
                            ? styles.up
                            : styles.down
                      }`}
                    >
                      {item.deltaRaw === undefined ? null : item.deltaRaw >= 0 ? (
                        <DeltaUpIcon />
                      ) : (
                        <DeltaDownIcon />
                      )}
                      {item.delta}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Chain</div>
          <div className={styles.metrics}>
            {metrics
              .filter(
                (item) =>
                  item.key === "blockHeight" ||
                  item.key === "blockTime" ||
                  item.key === "validators"
              )
              .map((item) => (
                <div
                  key={item.key}
                  className={`card ${styles.metricCard} ${
                    item.size === "large" ? styles.metricCardLarge : ""
                  } ${
                    item.layout === "wide"
                      ? styles.metricWide
                      : item.layout === "tall"
                        ? styles.metricTall
                        : ""
                  }`}
                >
                  <div className={styles.metricLabel}>{item.label}</div>
                  <div className={styles.metricValue}>
                    {item.value}
                    {item.unit ? <span>{item.unit}</span> : null}
                  </div>
                  {item.delta !== undefined && item.delta !== "--" ? (
                    <div
                      className={`${styles.delta} ${
                        item.deltaRaw === undefined
                          ? styles.neutral
                          : item.deltaRaw >= 0
                            ? styles.up
                            : styles.down
                      }`}
                    >
                      {item.deltaRaw === undefined ? null : item.deltaRaw >= 0 ? (
                        <DeltaUpIcon />
                      ) : (
                        <DeltaDownIcon />
                      )}
                      {item.delta}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>

      </div>
    </PageShell>
  )
}

export default Dashboard
