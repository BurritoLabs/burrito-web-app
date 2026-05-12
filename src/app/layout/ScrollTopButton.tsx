import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import styles from "./ScrollTopButton.module.css"

const SCROLL_THRESHOLD = 260

const getPageScroller = () => {
  if (typeof document === "undefined") return null
  return document.querySelector<HTMLElement>("[data-page-shell='true']")
}

const getCurrentScrollTop = () => {
  if (typeof window === "undefined") return 0
  const pageScrollTop = getPageScroller()?.scrollTop ?? 0
  const windowScrollTop =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  return Math.max(pageScrollTop, windowScrollTop)
}

const ScrollTopButton = () => {
  const location = useLocation()
  const [visible, setVisible] = useState(() => getCurrentScrollTop() > SCROLL_THRESHOLD)
  const visibleRef = useRef(visible)
  const frameRef = useRef<number | undefined>(undefined)

  const syncVisibility = useCallback(() => {
    const nextVisible = getCurrentScrollTop() > SCROLL_THRESHOLD
    if (visibleRef.current !== nextVisible) {
      visibleRef.current = nextVisible
      setVisible(nextVisible)
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncVisibility)
    const handleScroll = () => {
      if (frameRef.current !== undefined) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = undefined
        syncVisibility()
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    document.addEventListener("scroll", handleScroll, true)
    window.addEventListener("resize", handleScroll, { passive: true })

    return () => {
      window.cancelAnimationFrame(frame)
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = undefined
      }
      window.removeEventListener("scroll", handleScroll)
      document.removeEventListener("scroll", handleScroll, true)
      window.removeEventListener("resize", handleScroll)
    }
  }, [location.pathname, location.search, syncVisibility])

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncVisibility)
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, location.search, syncVisibility])

  const handleClick = () => {
    const scroller = getPageScroller()
    if (scroller && scroller.scrollTop > 0) {
      scroller.scrollTo({ top: 0, behavior: "smooth" })
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  return (
    <button
      type="button"
      className={`${styles.button} ${visible ? styles.visible : ""}`}
      onClick={handleClick}
      aria-label="Back to top"
      title="Back to top"
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 3h14" />
        <path d="m18 13-6-6-6 6" />
        <path d="M12 7v14" />
      </svg>
    </button>
  )
}

export default ScrollTopButton
