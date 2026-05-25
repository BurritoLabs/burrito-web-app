import { Link } from "react-router-dom"
import { truncateHash } from "../../app/utils/format"
import {
  getLaunchpadDeepLink,
  getLaunchpadMarketPath,
  isLuncPairLabel,
  launchFilters,
  launchSortOptions,
  type LaunchCardItem,
  type LaunchFilter,
  type LaunchSort
} from "../../app/launchpad/pageModel"
import styles from "../Launchpad.module.css"
import LaunchTokenLogo from "./LaunchTokenLogo"

type LaunchExplorePanelProps = {
  activeLaunchFilter: LaunchFilter
  copiedValue: string
  copyError: string
  exploreEmptyText: string
  filteredLaunches: LaunchCardItem[]
  isLaunchRegistryConfigured: boolean
  launchSearch: string
  launchSort: LaunchSort
  registryError?: string
  registryLoading: boolean
  selectedLaunch?: LaunchCardItem
  onCopyText: (value: string) => Promise<void>
  onFilterChange: (filter: LaunchFilter) => void
  onSearchChange: (value: string) => void
  onSelectLaunch: (launchId: string) => void
  onSortChange: (sort: LaunchSort) => void
}

const LaunchExplorePanel = ({
  activeLaunchFilter,
  copiedValue,
  copyError,
  exploreEmptyText,
  filteredLaunches,
  isLaunchRegistryConfigured,
  launchSearch,
  launchSort,
  registryError,
  registryLoading,
  selectedLaunch,
  onCopyText,
  onFilterChange,
  onSearchChange,
  onSelectLaunch,
  onSortChange
}: LaunchExplorePanelProps) => (
  <section className={styles.exploreGrid}>
    <article className={`card ${styles.exploreIntro}`}>
      <div>
        <span>Explore</span>
        <h3>New launches</h3>
        {registryLoading ? <p>Loading registry...</p> : null}
        {registryError ? <p>{registryError}</p> : null}
        {!isLaunchRegistryConfigured ? (
          <p>Registry is not configured.</p>
        ) : null}
      </div>
      <div className={styles.exploreControls}>
        <label className={styles.launchSearch}>
          <span>Search launches</span>
          <input
            value={launchSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Symbol, name, contract..."
            spellCheck={false}
          />
        </label>
        <label className={styles.launchSort}>
          <span>Sort</span>
          <select
            value={launchSort}
            onChange={(event) => onSortChange(event.target.value as LaunchSort)}
          >
            {launchSortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.filterBar}>
          {launchFilters.map((filter) => (
            <button
              key={filter.id}
              className={`${styles.filterButton} ${
                activeLaunchFilter === filter.id
                  ? styles.filterButtonActive
                  : ""
              }`}
              type="button"
              onClick={() => onFilterChange(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
    </article>

    {selectedLaunch ? (
      <article
        id="launchpad-selected-launch"
        className={`card ${styles.launchDetailPanel}`}
      >
        <div className={styles.launchDetailHeader}>
          <div className={styles.launchCardTop}>
            <LaunchTokenLogo
              symbol={selectedLaunch.symbol}
              logoUrl={selectedLaunch.logoUrl}
              pairedWithLunc={isLuncPairLabel(selectedLaunch.pair)}
            />
            <div>
              <span>{selectedLaunch.status}</span>
              <strong>{selectedLaunch.pair}</strong>
              <p>{selectedLaunch.name}</p>
            </div>
          </div>
          <div className={styles.riskLine}>{selectedLaunch.risk}</div>
        </div>
        <div className={styles.launchDetailGrid}>
          <div>
            <span>Liquidity</span>
            <strong>{selectedLaunch.liquidity}</strong>
          </div>
          <div>
            <span>LP lock</span>
            <strong>{selectedLaunch.lock}</strong>
          </div>
          <div>
            <span>Creator</span>
            <strong>{selectedLaunch.creator}</strong>
          </div>
          <div>
            <span>Token</span>
            <strong>
              {selectedLaunch.tokenContract
                ? truncateHash(selectedLaunch.tokenContract)
                : "--"}
            </strong>
          </div>
        </div>
        <p className={styles.launchDescription}>
          {selectedLaunch.description ||
            "No public description has been added yet. Treat this launch as higher risk until the creator publishes enough project information."}
        </p>
        <div className={styles.launchDetailActions}>
          {selectedLaunch.website ? (
            <a
              className="uiButton uiButtonOutline"
              href={selectedLaunch.website}
              target="_blank"
              rel="noreferrer"
            >
              Website
            </a>
          ) : null}
          {selectedLaunch.xProfile ? (
            <a
              className="uiButton uiButtonOutline"
              href={selectedLaunch.xProfile}
              target="_blank"
              rel="noreferrer"
            >
              X profile
            </a>
          ) : null}
          {selectedLaunch.tokenContract ? (
            <a
              className="uiButton uiButtonOutline"
              href={`https://finder.burrito.money/classic/address/${selectedLaunch.tokenContract}`}
              target="_blank"
              rel="noreferrer"
            >
              Token contract
            </a>
          ) : null}
          {selectedLaunch.pairContract ? (
            <Link
              className="uiButton uiButtonPrimary"
              to={getLaunchpadMarketPath(selectedLaunch.pairContract)}
            >
              Open market
            </Link>
          ) : null}
          <button
            className="uiButton uiButtonOutline"
            type="button"
            onClick={() => {
              void onCopyText(getLaunchpadDeepLink(selectedLaunch.id))
            }}
          >
            {copiedValue === getLaunchpadDeepLink(selectedLaunch.id)
              ? "Copied"
              : "Copy launch link"}
          </button>
        </div>
        {copyError ? <div className={styles.txError}>{copyError}</div> : null}
      </article>
    ) : null}

    {filteredLaunches.map((item) => (
      <article
        className={`card ${styles.launchCard} ${
          selectedLaunch?.id === item.id ? styles.launchCardSelected : ""
        }`}
        key={item.id}
      >
        <div className={styles.launchCardHeader}>
          <div className={styles.launchCardTop}>
            <LaunchTokenLogo
              symbol={item.symbol}
              logoUrl={item.logoUrl}
              pairedWithLunc={isLuncPairLabel(item.pair)}
            />
            <div>
              <span>{item.status}</span>
              <strong>{item.pair}</strong>
              <p>{item.name}</p>
            </div>
          </div>
          <div className={styles.riskLine}>{item.risk}</div>
        </div>
        <div className={styles.launchCardStats}>
          <div>
            <span>Liquidity</span>
            <strong>{item.liquidity}</strong>
          </div>
          <div>
            <span>LP lock</span>
            <strong>{item.lock}</strong>
          </div>
        </div>
        <div className={styles.launchCardBottom}>
          <div className={styles.launchCardActions}>
            <button
              className={
                selectedLaunch?.id === item.id
                  ? "uiButton uiButtonPrimary"
                  : "uiButton uiButtonOutline"
              }
              type="button"
              aria-pressed={selectedLaunch?.id === item.id}
              onClick={() => onSelectLaunch(item.id)}
            >
              Details
            </button>
            {item.pairContract ? (
              <Link
                className="uiButton uiButtonOutline"
                to={getLaunchpadMarketPath(item.pairContract)}
              >
                Open market
              </Link>
            ) : item.tokenContract ? (
              <a
                className="uiButton uiButtonOutline"
                href={`https://finder.burrito.money/classic/address/${item.tokenContract}`}
                target="_blank"
                rel="noreferrer"
              >
                Token
              </a>
            ) : (
              <button className="uiButton uiButtonOutline" type="button" disabled>
                Preview
              </button>
            )}
          </div>
        </div>
      </article>
    ))}

    {!filteredLaunches.length ? (
      <article className={`card ${styles.emptyState}`}>
        <span>No launches</span>
        <strong>{exploreEmptyText}</strong>
      </article>
    ) : null}
  </section>
)

export default LaunchExplorePanel
