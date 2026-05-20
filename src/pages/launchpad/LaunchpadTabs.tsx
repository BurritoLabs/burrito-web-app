import {
  tabs,
  type LaunchTab
} from "../../app/launchpad/pageModel"
import styles from "../Launchpad.module.css"

type LaunchpadTabsProps = {
  activeTab: LaunchTab
  onSelectTab: (tab: LaunchTab) => void
}

const LaunchpadTabs = ({ activeTab, onSelectTab }: LaunchpadTabsProps) => (
  <nav className={styles.tabBar} aria-label="Launchpad sections">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        className={`${styles.tabButton} ${
          activeTab === tab.id ? styles.tabButtonActive : ""
        }`}
        type="button"
        onClick={() => onSelectTab(tab.id)}
      >
        <strong>{tab.label}</strong>
      </button>
    ))}
  </nav>
)

export default LaunchpadTabs
