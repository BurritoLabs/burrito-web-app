import { Suspense, lazy, useEffect, useRef, useState, type SVGProps } from "react"
import styles from "./WalletPanel.module.css"
import {
  WALLET_PANEL_NAVIGATION_EVENT,
  type WalletPanelNavigationDetail
} from "./panelNavigation"
import { isLikelyMobileBrowser } from "./walletPlatform"

const loadWalletPanel = () => import("./WalletPanel")
const loadWalletAssetWarmup = () => import("./WalletAssetWarmup")

const WalletPanel = lazy(loadWalletPanel)
const WalletAssetWarmup = lazy(loadWalletAssetWarmup)

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
  onPrepare?: () => void
}

const WalletPanelHandle = ({
  loading = false,
  onOpen,
  onPrepare
}: WalletPanelHandleProps) => (
  <aside className={`${styles.wallet} ${styles.closed}`} aria-hidden="true">
    <button
      className={styles.close}
      onClick={onOpen}
      onFocus={onPrepare}
      onPointerDown={onPrepare}
      onPointerEnter={onPrepare}
      aria-label={loading ? "Loading wallet" : "Open wallet"}
      disabled={loading || !onOpen}
      type="button"
    >
      <span>{loading ? "Loading" : "Wallet"}</span>
      <WalletIcon className={styles.walletIcon} />
    </button>
  </aside>
)

const LoadingAssetRows = () => (
  <div className={styles.assetLoadingRows} aria-label="Loading wallet assets">
    {[0, 1, 2, 3, 4].map((index) => (
      <div key={index} className={styles.assetLoadingRow}>
        <span className={styles.assetLoadingIcon} />
        <span className={styles.assetLoadingText} />
        <span className={styles.assetLoadingValue} />
      </div>
    ))}
  </div>
)

const WalletPanelLoadingShell = () => (
  <aside className={styles.wallet} aria-label="Loading wallet">
    <button className={styles.close} aria-label="Loading wallet" disabled type="button">
      <span>Wallet</span>
      <WalletIcon className={styles.walletIcon} />
    </button>
    <div className={styles.details}>
      <div className={styles.networthHeader}>
        <span className={styles.kicker}>Portfolio value</span>
        <span className={styles.networthValue}>--</span>
        <span className={styles.viewMeta}>Loading wallet assets...</span>
      </div>
    </div>
    <div className={styles.assetList}>
      <div className={styles.assetHeader}>
        <div className={styles.assetTitle}>Assets</div>
      </div>
      <div className={styles.assetRows}>
        <LoadingAssetRows />
      </div>
    </div>
  </aside>
)

const DeferredWalletPanel = () => {
  const [requested, setRequested] = useState(() => {
    if (typeof window === "undefined") return false
    return (
      window.localStorage.getItem("burritoWalletOpen") === "true" &&
      !isLikelyMobileBrowser()
    )
  })
  const [warmupRequested, setWarmupRequested] = useState(false)
  const pendingDetailRef = useRef<WalletPanelNavigationDetail | null>(null)

  const prepareWalletPanel = () => {
    void loadWalletPanel()
    void loadWalletAssetWarmup()
    setWarmupRequested(true)
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleNavigation = (event: Event) => {
      const detail = (event as CustomEvent<WalletPanelNavigationDetail>).detail
      void loadWalletPanel()
      void loadWalletAssetWarmup()
      setWarmupRequested(true)
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
    prepareWalletPanel()
    pendingDetailRef.current = { view: "wallet" }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("burritoWalletOpen", "true")
    }
    setRequested(true)
  }

  if (!requested) {
    return (
      <>
        {warmupRequested ? (
          <Suspense fallback={null}>
            <WalletAssetWarmup />
          </Suspense>
        ) : null}
        <WalletPanelHandle onOpen={handleOpen} onPrepare={prepareWalletPanel} />
      </>
    )
  }

  return (
    <>
      {warmupRequested ? (
        <Suspense fallback={null}>
          <WalletAssetWarmup />
        </Suspense>
      ) : null}
      <Suspense fallback={<WalletPanelLoadingShell />}>
        <WalletPanel />
      </Suspense>
    </>
  )
}

export default DeferredWalletPanel
