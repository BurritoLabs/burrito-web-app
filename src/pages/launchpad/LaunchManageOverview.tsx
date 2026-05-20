import { type FormEvent } from "react"
import { Link } from "react-router-dom"
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
  importAddress: string
  importError?: string
  importSubmitting: boolean
  isActiveOwnerLocalRecord: boolean
  isLaunchRegistryConfigured: boolean
  localRecordNotice: string
  ownerRecords: OwnerLaunchRecord[]
  showOwnerDistributionTool: boolean
  syncError?: string
  syncResult: string
  syncSubmitting: boolean
  onCopyText: (value: string) => Promise<void>
  onImportAddressChange: (value: string) => void
  onImportSubmit: (event: FormEvent<HTMLFormElement>) => void
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
  importAddress,
  importError,
  importSubmitting,
  isActiveOwnerLocalRecord,
  isLaunchRegistryConfigured,
  localRecordNotice,
  ownerRecords,
  showOwnerDistributionTool,
  syncError,
  syncResult,
  syncSubmitting,
  onCopyText,
  onImportAddressChange,
  onImportSubmit,
  onRemoveLocalRecord,
  onScrollToManageSection,
  onSelectOwnerId,
  onSetManageSection,
  onSyncOwnerLaunches
}: LaunchManageOverviewProps) => (
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
              Create a token or import an existing CW20 to unlock owner tools.
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

    <form
      id="launchpad-import"
      className={`card ${styles.ownerImport}`}
      onSubmit={onImportSubmit}
    >
      <div>
        <span>Import token</span>
        <h3>Recover an existing CW20</h3>
      </div>
      <div className={styles.importRow}>
        <input
          value={importAddress}
          onChange={(event) => onImportAddressChange(event.target.value)}
          placeholder="terra1..."
          spellCheck={false}
        />
        <button
          className="uiButton uiButtonPrimary"
          type="submit"
          disabled={importSubmitting}
        >
          {importSubmitting ? "Importing..." : "Import"}
        </button>
      </div>
      {importError ? <div className={styles.txError}>{importError}</div> : null}
    </form>

    {activeOwnerLaunch ? (
      <article className={`card ${styles.ownerReadiness}`}>
        <div className={styles.planHeader}>
          <span>Next step</span>
          <h3>{activeOwnerNextAction.title}</h3>
          <p>{activeOwnerNextAction.text}</p>
        </div>
        {activeOwnerNextAction.actionLabel ? (
          <div className={styles.ownerNextActions}>
            <button
              className="uiButton uiButtonPrimary"
              type="button"
              onClick={() =>
                onScrollToManageSection(activeOwnerNextAction.targetId)
              }
            >
              {activeOwnerNextAction.actionLabel}
            </button>
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
              href={`https://finder.burrito.money/classic/address/${activeOwnerLaunch.contractAddress}`}
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

export default LaunchManageOverview
