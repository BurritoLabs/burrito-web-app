import { useEffect, useState } from "react"
import { useIsFetching } from "@tanstack/react-query"
import styles from "./LoadingBar.module.css"

const LoadingBar = () => {
  const isFetching = useIsFetching()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    if (isFetching > 0) {
      timer = window.setTimeout(() => setVisible(true), 120)
    } else {
      setVisible(false)
    }

    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [isFetching])

  if (!visible) return null

  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-label="Loading"
      aria-hidden={isFetching === 0}
    />
  )
}

export default LoadingBar
