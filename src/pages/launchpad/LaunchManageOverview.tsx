import { Link } from "react-router-dom"
import { useAppChain } from "../../app/appChainContext"
import { getAddressExplorerUrl } from "../../app/explorer"
import {
  getLaunchpadMarketPath,
  isLuncPairLabel,
  type ManageSection,
  type OwnerLaunchRecord,
  type OwnerNextAction
} from "../../app/launchpad/pageModel"
import styles from "../Launchpad.module.css"
import LaunchTokenLogo from "./LaunchTokenLogo"

type ReadinessItem = {
  label: string
  value: string
  done: boolean
}

type LaunchManageOverviewProps = {
  activeManageSection: ManageSection
  activeOwnerIsCw20Only: boolean
  activeOwnerLaunch?: OwnerLaunchRecord
  activeOwnerNextAction: OwnerNextAction
  activeOwnerReadiness: ReadinessItem[]
  activePairAddress: string
  accountAddress?: string
  copiedValue: string
  copyError: string
  hiddenLocalRecordCount: number
  isActiveOwnerLocalRecord: boolean
  isLaunchRegistryConfigured: boolean
  localRecordNotice: string
  ownerRecords: OwnerLaunchRecord[]
  showOwnerDistributionTool: boolean
  syncError?: string
  syncResult: string
  syncSubmitting: boolean
  onCopyText: (value: string) => Promise<void>
  onRemoveLocalRecord: () => void
  onScrollToManageSection: (targetId?: string) => void
  onSelectOwnerId: (ownerId: string) => void
  onSetManageSection: (section: ManageSection) => void
  onSyncOwnerLaunches: () => void
}

const LaunchManageOverview = ({
  activeManageSection,
  activeOwnerIsCw20Only,
  activeOwnerLaunch,
  activeOwnerNextAction,
  activeOwnerReadiness,
  activePairAddress,
  accountAddress,
  copiedValue,
  copyError,
  hiddenLocalRecordCount,
  isActiveOwnerLocalRecord,
  isLaunchRegistryConfigured,
  localRecordNotice,
  ownerRecords,
  showOwnerDistributionTool,
  syncError,
  syncResult,
  syncSubmitting,
  onCopyText,
  onRemoveLocalRecord,
  onScrollToManageSection,
  onSelectOwnerId,
  onSetManageSection,
  onSyncOwnerLaunches
}: LaunchManageOverviewProps) => {
  const { chainKey } = useAppChain()

  return (
    <>
    <article className={`card ${styles.ownerIntro}`}>
      <div>
        <span>Manage</span>
        <h3>My launches</h3>
        <p>Select a launch, then finish the next required step.</p>
      </div>
      <div className={styles.ownerControlPanel}>
        <div className={styles.ownerSelector}>
          {ownerRecords.length ? (
            ownerRecords.map((launch) => (
              <button
                key={launch.id}
                className={`${styles.ownerSelectButton} ${
                  activeOwnerLaunch?.id === launch.id
                    ? styles.ownerSelectButtonActive
                    : ""
                }`}
                type="button"
                onClick={() => onSelectOwnerId(launch.id)}
              >
                <LaunchTokenLogo
                  symbol={launch.symbol}
                  logoUrl={launch.logoUrl}
                  pairedWithLunc={isLuncPairLabel(launch.pair)}
                />
                <div>
                  <span>{launch.mode}</span>
                  <strong>{launch.pair}</strong>
                </div>
              </button>
            ))
          ) : (
            <div className={styles.ownerEmptyHint}>
              {!accountAddress
                ? "Connect a wallet to view your launches."
                : hiddenLocalRecordCount
                  ? "Only launches tied to the connected wallet are shown. Use Sync my launches to restore published launches."
                  : "Create a launch or sync published launches to unlock owner tools."}
            </div>
          )}
        </div>
        <div className={styles.ownerSyncRow}>
          <button
            className="uiButton uiButtonOutline"
            type="button"
            disabled={
              syncSubmitting || !accountAddress || !isLaunchRegistryConfigured
            }
            onClick={onSyncOwnerLaunches}
          >
            {syncSubmitting ? "Syncing..." : "Sync my launches"}
          </button>
          {syncError ? (
            <span className={styles.ownerSyncError}>{syncError}</span>
          ) : syncResult ? (
            <span className={styles.ownerSyncNote}>{syncResult}</span>
          ) : null}
        </div>
      </div>
    </article>

    {activeOwnerLaunch ? (
      <article className={`card ${styles.ownerReadiness}`}>
        <div className={styles.planHeader}>
          <span>Next step</span>
          <h3>{activeOwnerNextAction.title}</h3>
          <p>{activeOwnerNextAction.text}</p>
        </div>
        {activeOwnerNextAction.actionLabel ? (
          <div className={styles.ownerNextActions}>
            {activeOwnerNextAction.actionTo ? (
              <Link
                className="uiButton uiButtonPrimary"
                to={activeOwnerNextAction.actionTo}
              >
                {activeOwnerNextAction.actionLabel}
              </Link>
            ) : (
              <button
                className="uiButton uiButtonPrimary"
                type="button"
                onClick={() =>
                  onScrollToManageSection(activeOwnerNextAction.targetId)
                }
              >
                {activeOwnerNextAction.actionLabel}
              </button>
            )}
          </div>
        ) : null}
        <div className={styles.ownerReadinessGrid}>
          {activeOwnerReadiness.map((item) => (
            <div
              className={item.done ? styles.readinessDone : ""}
              key={item.label}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </article>
    ) : null}

    {activeOwnerLaunch ? (
      <article className={`card ${styles.ownerSummary}`}>
        <div className={styles.ownerSummaryTop}>
          <div className={styles.launchCardTop}>
            <LaunchTokenLogo
              symbol={activeOwnerLaunch.symbol}
              logoUrl={activeOwnerLaunch.logoUrl}
              pairedWithLunc={isLuncPairLabel(activeOwnerLaunch.pair)}
            />
            <div>
              <span>Selected launch</span>
              <strong>{activeOwnerLaunch.pair}</strong>
              <p>{activeOwnerLaunch.name}</p>
            </div>
          </div>
          <strong className={styles.ownerStatusBadge}>
            {activeOwnerLaunch.ownerStatus}
          </strong>
        </div>
        <div className={styles.ownerSummaryGrid}>
          <div>
            <span>Liquidity</span>
            <strong>{activeOwnerLaunch.liquidity}</strong>
          </div>
          <div>
            <span>LP unlock</span>
            <strong>{activeOwnerLaunch.lockExpiry}</strong>
          </div>
          <div>
            <span>Public info</span>
            <strong>{activeOwnerLaunch.infoStatus}</strong>
          </div>
        </div>
        <div className={styles.ownerQuickActions}>
          {activeOwnerLaunch.contractAddress ? (
            <button
              className="uiButton uiButtonOutline"
              type="button"
              onClick={() => {
                void onCopyText(activeOwnerLaunch.contractAddress ?? "")
              }}
            >
              {copiedValue === activeOwnerLaunch.contractAddress
                ? "Copied"
                : "Copy token"}
            </button>
          ) : null}
          {activePairAddress ? (
            <button
              className="uiButton uiButtonOutline"
              type="button"
              onClick={() => {
                void onCopyText(activePairAddress)
              }}
            >
              {copiedValue === activePairAddress ? "Copied" : "Copy pair"}
            </button>
          ) : null}
          {activeOwnerLaunch.contractAddress ? (
            <a
              className="uiButton uiButtonOutline"
              href={getAddressExplorerUrl(
                chainKey,
                activeOwnerLaunch.contractAddress
              )}
              target="_blank"
              rel="noreferrer"
            >
              Open token
            </a>
          ) : null}
          {activePairAddress ? (
            <Link
              className="uiButton uiButtonPrimary"
              to={getLaunchpadMarketPath(activePairAddress)}
            >
              Open market
            </Link>
          ) : null}
          {activeOwnerLaunch.registryLaunchId ? (
            <Link
              className="uiButton uiButtonOutline"
              to={`/launchpad?tab=explore&launch=registry-${encodeURIComponent(
                activeOwnerLaunch.registryLaunchId
              )}`}
            >
              Open listing
            </Link>
          ) : null}
          <button
            className="uiButton uiButtonOutline"
            type="button"
            disabled={!isActiveOwnerLocalRecord}
            onClick={onRemoveLocalRecord}
          >
            Remove local record
          </button>
        </div>
        {copyError ? <div className={styles.txError}>{copyError}</div> : null}
        {localRecordNotice ? (
          <div className={styles.ownerSyncNote}>{localRecordNotice}</div>
        ) : null}
      </article>
    ) : null}

    {activeOwnerLaunch ? (
      <article
        id="launchpad-manage-tools"
        className={`card ${styles.ownerToolNav}`}
      >
        <div>
          <span>Tools</span>
          <h3>Manage flow</h3>
        </div>
        <div className={styles.ownerToolTabs}>
          {!activeOwnerIsCw20Only ? (
            <>
              <button
                className={`${styles.ownerToolTab} ${
                  activeManageSection === "pool"
                    ? styles.ownerToolTabActive
                    : ""
                }`}
                type="button"
                onClick={() => onSetManageSection("pool")}
              >
                <span>01</span>
                <strong>Pool</strong>
              </button>
              <button
                className={`${styles.ownerToolTab} ${
                  activeManageSection === "lock"
                    ? styles.ownerToolTabActive
                    : ""
                }`}
                type="button"
                onClick={() => onSetManageSection("lock")}
              >
                <span>02</span>
                <strong>LP lock</strong>
              </button>
              <button
                className={`${styles.ownerToolTab} ${
                  activeManageSection === "listing"
                    ? styles.ownerToolTabActive
                    : ""
                }`}
                type="button"
                onClick={() => onSetManageSection("listing")}
              >
                <span>03</span>
                <strong>Publish</strong>
              </button>
            </>
          ) : null}
          {showOwnerDistributionTool ? (
            <button
              className={`${styles.ownerToolTab} ${
                activeManageSection === "distribution"
                  ? styles.ownerToolTabActive
                  : ""
              }`}
              type="button"
              onClick={() => onSetManageSection("distribution")}
            >
              <span>{activeOwnerIsCw20Only ? "01" : "04"}</span>
              <strong>Distribute</strong>
            </button>
          ) : null}
        </div>
      </article>
    ) : null}
    </>
  )
}

export default LaunchManageOverview
