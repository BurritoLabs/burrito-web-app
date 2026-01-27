import { useRef, useState } from "react"
import type { ReactNode } from "react"
import styles from "./Tabs.module.css"

type Tab = {
  key: string
  label: string
  content: ReactNode
  hidden?: boolean
}

type TabsProps = {
  tabs: Tab[]
  defaultKey?: string
  variant?: "page" | "card"
  activeKey?: string
  onChange?: (key: string) => void
}

const Tabs = ({
  tabs,
  defaultKey,
  variant = "page",
  activeKey,
  onChange
}: TabsProps) => {
  const initial = defaultKey ?? tabs[0]?.key
  const [internalKey, setInternalKey] = useState(initial)
  const currentKey = activeKey ?? internalKey
  const active = tabs.find((tab) => tab.key === currentKey) ?? tabs[0]

  const visibleTabs = tabs.filter((tab) => !tab.hidden)
  const tabRefs = visibleTabs.map(() => useRef<HTMLButtonElement | null>(null))

  const setKey = (key: string) => {
    if (activeKey === undefined) {
      setInternalKey(key)
    }
    onChange?.(key)
  }

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % visibleTabs.length
        : (index - 1 + visibleTabs.length) % visibleTabs.length
    tabRefs[nextIndex]?.current?.focus()
    setKey(visibleTabs[nextIndex]?.key)
  }

  return (
    <div className={styles.container}>
      <div className={`${styles.tabs} ${styles[variant] ?? ""}`}>
        {visibleTabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${
              tab.key === currentKey ? styles.active : ""
            }`}
            onClick={() => setKey(tab.key)}
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
