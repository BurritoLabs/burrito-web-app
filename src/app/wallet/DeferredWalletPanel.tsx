import { Suspense, lazy, useEffect, useRef, useState, type SVGProps } from "react"
import styles from "./WalletPanel.module.css"
import {
  WALLET_PANEL_NAVIGATION_EVENT,
  type WalletPanelNavigationDetail
} from "./panelNavigation"

const WalletPanel = lazy(() => import("./WalletPanel"))

type IconProps = SVGProps<SVGSVGElement>

const WalletIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9Zm-9-2h10V8H12v8Zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Z"
      fill="currentColor"
    />
  </svg>
)

type WalletPanelHandleProps = {
  loading?: boolean
  onOpen?: () => void
}

const WalletPanelHandle = ({
  loading = false,
  onOpen
}: WalletPanelHandleProps) => (
  <aside className={`${styles.wallet} ${styles.closed}`} aria-hidden="true">
    <button
      className={styles.close}
      onClick={onOpen}
      aria-label={loading ? "Loading wallet" : "Open wallet"}
      disabled={loading || !onOpen}
      type="button"
    >
      <span>{loading ? "Loading" : "Wallet"}</span>
      <WalletIcon className={styles.walletIcon} />
    </button>
  </aside>
)

const DeferredWalletPanel = () => {
  const [requested, setRequested] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("burritoWalletOpen") === "true"
  })
  const pendingDetailRef = useRef<WalletPanelNavigationDetail | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleNavigation = (event: Event) => {
      const detail = (event as CustomEvent<WalletPanelNavigationDetail>).detail
      pendingDetailRef.current = detail ?? { view: "wallet" }
      window.localStorage.setItem("burritoWalletOpen", "true")
      setRequested(true)
    }

    window.addEventListener(
      WALLET_PANEL_NAVIGATION_EVENT,
      handleNavigation as EventListener
    )
    return () =>
      window.removeEventListener(
        WALLET_PANEL_NAVIGATION_EVENT,
        handleNavigation as EventListener
      )
  }, [])

  useEffect(() => {
    if (!requested || !pendingDetailRef.current || typeof window === "undefined") {
      return
    }

    const detail = pendingDetailRef.current
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent<WalletPanelNavigationDetail>(
          WALLET_PANEL_NAVIGATION_EVENT,
          { detail }
        )
      )
      pendingDetailRef.current = null
    })

    return () => window.cancelAnimationFrame(frame)
  }, [requested])

  const handleOpen = () => {
    pendingDetailRef.current = { view: "wallet" }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("burritoWalletOpen", "true")
    }
    setRequested(true)
  }

  if (!requested) {
    return <WalletPanelHandle onOpen={handleOpen} />
  }

  return (
    <Suspense fallback={<WalletPanelHandle loading />}>
      <WalletPanel />
    </Suspense>
  )
}

export default DeferredWalletPanel
