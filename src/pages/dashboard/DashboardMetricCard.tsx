import styles from "../Dashboard.module.css"
import type { MetricItem } from "../../app/dashboard/dashboardFormat"

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

type DashboardMetricCardProps = {
  item: MetricItem
  forceLarge?: boolean
}

export const DashboardMetricCard = ({
  item,
  forceLarge = false
}: DashboardMetricCardProps) => (
  <div
    className={`card ${styles.metricCard} ${
      forceLarge || item.size === "large" ? styles.metricCardLarge : ""
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
)

const MetricSkeletonCard = ({ large = false }: { large?: boolean }) => (
  <div
    className={`card ${styles.metricCard} ${
      large ? styles.metricCardLarge : ""
    } ${styles.metricSkeleton}`}
    aria-hidden="true"
  >
    <span className={styles.skeletonLabel} />
    <span className={styles.skeletonValue} />
    <span className={styles.skeletonDelta} />
  </div>
)

export const DashboardMetricSkeletons = ({
  count,
  large = false
}: {
  count: number
  large?: boolean
}) => (
  <>
    {Array.from({ length: count }, (_, index) => (
      <MetricSkeletonCard key={`metric-skeleton-${index}`} large={large} />
    ))}
  </>
)
