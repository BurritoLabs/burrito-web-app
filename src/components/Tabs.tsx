import { useState } from "react"
import type { ReactNode } from "react"
import styles from "./Tabs.module.css"

type Tab = {
  key: string
  label: string
  content: ReactNode
}

type TabsProps = {
  tabs: Tab[]
  defaultKey?: string
  variant?: "page" | "card"
}

const Tabs = ({ tabs, defaultKey, variant = "page" }: TabsProps) => {
  const initial = defaultKey ?? tabs[0]?.key
  const [activeKey, setActiveKey] = useState(initial)
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0]

  const variantClass = styles[variant] ?? ""

  return (
    <div className={`${styles.container} ${variantClass}`}>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${
              tab.key === activeKey ? styles.active : ""
            }`}
            onClick={() => setActiveKey(tab.key)}
          >
            <span className={styles.title}>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.content}>{active?.content}</div>
    </div>
  )
}

export default Tabs
