import { useRef, useState } from "react"
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

  const tabRefs = tabs.map(() => useRef<HTMLButtonElement | null>(null))

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const nextIndex =
      event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length
    tabRefs[nextIndex]?.current?.focus()
    setActiveKey(tabs[nextIndex]?.key)
  }

  return (
    <div className={styles.container}>
      <div className={`${styles.tabs} ${styles[variant] ?? ""}`}>
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${
              tab.key === activeKey ? styles.active : ""
            }`}
            onClick={() => setActiveKey(tab.key)}
            ref={tabRefs[index]}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className={styles.title}>{tab.label}</span>
          </button>
        ))}
      </div>
      {variant === "page" ? (
        <div className={styles.content}>{active?.content}</div>
      ) : (
        active?.content
      )}
    </div>
  )
}

export default Tabs
