import { useCallback, useEffect, useRef, useState } from "react"
import styles from "../MarketPairDetails.module.css"
import {
  nextAvailableMarketIconIndex,
  rememberFailedMarketIcon
} from "./marketAssetIconCache"

const REMOTE_ICON_TIMEOUT_MS = 4_500

export type MarketPairAssetIconProps = {
  candidates: string[]
  /** Eagerly fetch above-the-fold icons and give them browser priority. */
  priority?: boolean
  size: number
  symbol: string
}

const MarketPairAssetIcon = ({
  symbol,
  candidates,
  size,
  priority = false
}: MarketPairAssetIconProps) => {
  const candidateKey = `${symbol}:${candidates.join("|")}`
  return (
    <MarketPairAssetIconInner
      key={candidateKey}
      symbol={symbol}
      candidates={candidates}
      size={size}
      priority={priority}
    />
  )
}

type MarketPairAssetIconInnerProps = {
  candidates: string[]
  priority: boolean
  size: number
  symbol: string
}

const MarketPairAssetIconInner = ({
  symbol,
  candidates,
  size,
  priority
}: MarketPairAssetIconInnerProps) => {
  const [index, setIndex] = useState(() => nextAvailableMarketIconIndex(candidates))
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(index < 0)
  const [nearViewport, setNearViewport] = useState(priority)
  const containerRef = useRef<HTMLSpanElement>(null)
  const src = index >= 0 ? candidates[index] : undefined
  const currentSourceRef = useRef({ index, src })
  currentSourceRef.current = { index, src }
  const timeoutRef = useRef<{
    index: number
    source: string
    timerId: ReturnType<typeof globalThis.setTimeout>
  } | null>(null)
  const systemFallback = candidates.find((candidate) =>
    candidate.startsWith("/system/")
  )

  const advancePastFailedSource = useCallback(
    (source: string, sourceIndex: number) => {
      const currentSource = currentSourceRef.current
      if (currentSource.src !== source || currentSource.index !== sourceIndex) return

      rememberFailedMarketIcon(source)
      setLoaded(false)
      const nextIndex = nextAvailableMarketIconIndex(candidates, sourceIndex + 1)
      if (nextIndex < 0) {
        setIndex(-1)
        setFailed(true)
        return
      }
      setIndex(nextIndex)
    },
    [candidates]
  )

  useEffect(() => {
    if (priority || !containerRef.current || typeof IntersectionObserver === "undefined") {
      if (!priority) setNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setNearViewport(true)
        observer.disconnect()
      },
      { rootMargin: "200px" }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [priority])

  useEffect(() => {
    if (!nearViewport || loaded || !src || !/^https?:\/\//i.test(src)) return

    const activeTimeout = {
      index,
      source: src,
      timerId: globalThis.setTimeout(() => {
        if (timeoutRef.current !== activeTimeout) return
        timeoutRef.current = null
        advancePastFailedSource(src, index)
      }, REMOTE_ICON_TIMEOUT_MS)
    }
    timeoutRef.current = activeTimeout

    return () => {
      // A stale effect cleanup must never clear a timer installed for a newer source.
      if (timeoutRef.current !== activeTimeout) return
      globalThis.clearTimeout(activeTimeout.timerId)
      timeoutRef.current = null
    }
  }, [advancePastFailedSource, index, loaded, nearViewport, src])

  const markLoaded = (source: string, sourceIndex: number) => {
    const currentTimeout = timeoutRef.current
    if (currentTimeout?.source === source && currentTimeout.index === sourceIndex) {
      globalThis.clearTimeout(currentTimeout.timerId)
      timeoutRef.current = null
    }
    if (currentSourceRef.current.src === source && currentSourceRef.current.index === sourceIndex) {
      setLoaded(true)
    }
  }

  const fallback = systemFallback ? (
    <img
      aria-hidden="true"
      alt=""
      src={systemFallback}
      width={size}
      height={size}
      decoding="async"
      style={{
        inset: 0,
        position: "absolute",
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={styles.assetIconFallback}
      style={{ inset: 0, position: "absolute", width: "100%", height: "100%" }}
    />
  )

  return (
    <span
      ref={containerRef}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-flex",
        flex: "0 0 auto"
      }}
    >
      {fallback}
      {!failed && src ? (
        <img
          loading={priority || nearViewport ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          src={src}
          alt={symbol}
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          style={{
            inset: 0,
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: "opacity 120ms ease"
          }}
          onLoad={() => markLoaded(src, index)}
          onError={() => advancePastFailedSource(src, index)}
        />
      ) : null}
    </span>
  )
}

export default MarketPairAssetIcon

// Shared alias: MarketPage can use the same candidate fallback/cache behavior.
export const MarketAssetIcon = MarketPairAssetIcon
