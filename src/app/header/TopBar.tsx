import { lazy, Suspense, useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { BurritoThemeSwitcher } from "@burritolabs/ui"
import styles from "./TopBar.module.css"
import { SUPPORTED_APP_CHAINS, type AppChainKey } from "../appChains"
import { useAppChain } from "../appChainContext"
import { WalletIcon } from "../icons"
import { useWallet } from "../wallet/WalletContext"
import { getWalletConnectorLabel } from "../wallet/walletMeta"
import { CLASSIC_CHAIN } from "../chain"
import { fetchValidator } from "../data/classic"
import { convertBech32Prefix } from "../utils/bech32"
import BrandLogo from "../../components/brand/BrandLogo"
import { getTxExplorerUrl } from "../explorer"
import { getChainSwitchDestination } from "../routes/chainSwitchNavigation"

const ConnectModal = lazy(() => import("../wallet/ConnectModal"))
const WalletAddressesModal = lazy(() => import("../wallet/WalletAddressesModal"))

type TopBarProps = {
  onMenuClick?: () => void
  menuOpen?: boolean
}

const TopBar = ({ onMenuClick, menuOpen }: TopBarProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { account, txState, connectorId, disconnect } = useWallet()
  const { chainKey, chain, setChainKey } = useAppChain()
  const [connectOpen, setConnectOpen] = useState(false)
  const [addressesOpen, setAddressesOpen] = useState(false)
  const [chainOpen, setChainOpen] = useState(false)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const chainMenuRef = useRef<HTMLDivElement | null>(null)
  const chainMenuPortalRef = useRef<HTMLDivElement | null>(null)
  const chainButtonRef = useRef<HTMLButtonElement | null>(null)
  const walletMenuRef = useRef<HTMLDivElement | null>(null)
  const walletMenuPortalRef = useRef<HTMLDivElement | null>(null)
  const walletButtonRef = useRef<HTMLButtonElement | null>(null)
  const [walletMenuPos, setWalletMenuPos] = useState<
    | {
        top: number
        right: number
      }
    | null
  >(null)
  const [chainMenuPos, setChainMenuPos] = useState<
    | {
        top: number
        left: number
      }
    | null
  >(null)
  const walletName = account?.name?.trim() || getWalletConnectorLabel(connectorId)
  const connectLabel = account
    ? walletName ||
      `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : "Connect"
  const valoperAddress = account?.address
    ? convertBech32Prefix(
        account.address,
        `${CLASSIC_CHAIN.bech32Prefix}valoper`
      )
    : null

  const { data: validator } = useQuery({
    queryKey: ["validator", chain.chainId, valoperAddress],
    queryFn: () => fetchValidator(valoperAddress ?? ""),
    enabled: Boolean(valoperAddress),
    staleTime: 60_000
  })
  const validatorMoniker = validator?.description?.moniker?.trim() ?? ""
  const showValidator = Boolean(validatorMoniker)
  const showTx = txState.status !== "idle"
  const txTitle =
    txState.status === "pending"
      ? "Broadcasting"
      : txState.status === "success"
      ? "Tx submitted"
      : txState.status === "error"
      ? "Tx failed"
      : ""
  const txDetail = txState.hash
    ? `${txState.hash.slice(0, 6)}...${txState.hash.slice(-4)}`
    : txState.label || txState.error || "Processing"

  useEffect(() => {
    if (!chainOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        chainMenuRef.current?.contains(target) ||
        chainMenuPortalRef.current?.contains(target)
      ) {
        return
      }
      if (!chainMenuRef.current?.contains(target)) {
        setChainOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChainOpen(false)
    }
    window.addEventListener("mousedown", handleClick)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("mousedown", handleClick)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [chainOpen])

  useEffect(() => {
    if (!chainOpen) return
    const updatePosition = () => {
      if (!chainButtonRef.current) return
      const rect = chainButtonRef.current.getBoundingClientRect()
      const menuWidth = Math.min(208, window.innerWidth - 32)
      setChainMenuPos({
        top: rect.bottom + 8,
        left: Math.max(
          16,
          Math.min(rect.left, window.innerWidth - menuWidth - 16)
        )
      })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [chainOpen])

  useEffect(() => {
    if (!walletMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        walletMenuRef.current?.contains(target) ||
        walletMenuPortalRef.current?.contains(target)
      ) {
        return
      }
      if (walletMenuRef.current && !walletMenuRef.current.contains(target)) {
        setWalletMenuOpen(false)
      }
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [walletMenuOpen])

  const selectChain = (next: AppChainKey) => {
    if (next === chainKey) {
      setChainOpen(false)
      return
    }
    const destination = getChainSwitchDestination(location)
    setChainKey(next)
    if (destination) navigate(destination, { replace: true })
    setChainOpen(false)
  }

  useEffect(() => {
    if (!walletMenuOpen) return
    const updatePosition = () => {
      if (!walletButtonRef.current) return
      const rect = walletButtonRef.current.getBoundingClientRect()
      setWalletMenuPos({
        top: rect.bottom + 10,
        right: window.innerWidth - rect.right
      })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [walletMenuOpen])

  return (
    <div className={styles.bar}>
      <div className={styles.leftRail}>
        <Link
          to="/"
          className={`${styles.mobileBrand} ${styles.mobileBrandLink}`}
          aria-label="Go to dashboard"
        >
          <BrandLogo textSize={20} iconSize={24} gap={6} />
        </Link>
        <div
          className={styles.chainSwitcher}
          ref={chainMenuRef}
          style={{ "--chain-rgb": chain.accentRgb } as React.CSSProperties}
          aria-label="Network switcher"
        >
          <button
            type="button"
            className={`${styles.chainTrigger} ${
              chainOpen ? styles.chainTriggerOpen : ""
            }`}
            aria-haspopup="menu"
            aria-expanded={chainOpen}
            aria-label="Switch network"
            ref={chainButtonRef}
            onClick={() => setChainOpen((open) => !open)}
          >
            <span className={styles.chainLogo}>
              <span>
                <img src={chain.logoSrc} alt="" />
              </span>
            </span>
            <span className={styles.chainCurrent}>{chain.symbol}</span>
            <svg
              className={`${styles.chainChevron} ${
                chainOpen ? styles.chainChevronOpen : ""
              }`}
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M4.25 6.25 8 10l3.75-3.75"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {chainOpen && chainMenuPos
            ? createPortal(
                <div
                  className={styles.chainMenu}
                  role="menu"
                  ref={chainMenuPortalRef}
                  style={{
                    position: "fixed",
                    top: chainMenuPos.top,
                    left: chainMenuPos.left
                  }}
                >
                  {SUPPORTED_APP_CHAINS.map((item) => {
                    const active = item.key === chainKey
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`${styles.chainOption} ${
                          active ? styles.chainOptionActive : ""
                        }`}
                        style={
                          {
                            "--chain-rgb": item.accentRgb
                          } as React.CSSProperties
                        }
                        role="menuitem"
                        aria-current={active ? "true" : undefined}
                        onClick={() => selectChain(item.key)}
                      >
                        <span className={styles.chainLogo}>
                          <span>
                            <img src={item.logoSrc} alt="" />
                          </span>
                        </span>
                        <span className={styles.chainName}>
                          <span>{item.symbol}</span>
                          <span>{item.name}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>,
                document.body
              )
            : null}
        </div>
      </div>
      <div className={styles.actions}>
        <BurritoThemeSwitcher />
        {showValidator ? (
          <button
            className={`uiButton uiButtonOutline ${styles.validatorButton}`}
            type="button"
            onClick={() => navigate("/commission")}
            title={validatorMoniker}
            aria-label={`Withdraw ${validatorMoniker} commission`}
          >
            <span className={styles.validatorLabel}>{validatorMoniker}</span>
          </button>
        ) : null}
        <div className={styles.walletMenuWrapper} ref={walletMenuRef}>
          <button
            className={`uiButton uiButtonOutline ${styles.connectButton} ${
              account ? styles.connected : ""
            }`}
            type="button"
            ref={walletButtonRef}
            onClick={() => {
              if (account) {
                setWalletMenuOpen((open) => !open)
              } else {
                setConnectOpen(true)
              }
            }}
          >
            {account ? (
              <span className={styles.walletButtonContent}>
                <span
                  className={styles.walletBadge}
                  data-wallet={connectorId || "wallet"}
                >
                  <WalletIcon width={16} height={16} aria-hidden="true" />
                </span>
                <span>{connectLabel}</span>
              </span>
            ) : (
              connectLabel
            )}
          </button>
          {account && walletMenuOpen && walletMenuPos
            ? createPortal(
                <div
                  className={styles.walletMenu}
                  ref={walletMenuPortalRef}
                  style={{
                    position: "fixed",
                    top: walletMenuPos.top,
                    right: walletMenuPos.right
                  }}
                >
                  {showValidator ? (
                    <button
                      type="button"
                      className={`${styles.walletMenuItem} ${styles.validatorMenuItem}`}
                      onClick={() => {
                        setWalletMenuOpen(false)
                        navigate("/commission")
                      }}
                    >
                      <span className={styles.walletMenuItemText}>
                        <span>{validatorMoniker}</span>
                        <span>Withdraw commission</span>
                      </span>
                      <span className={styles.walletMenuIcon} aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none">
                          <circle
                            cx="8"
                            cy="8"
                            r="5.25"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                          <path
                            d="M8 4.75v6.5M6.25 6.25h2.6a1.4 1.4 0 0 1 0 2.8H7.1a1.4 1.4 0 0 0 0 2.8h2.65"
                            stroke="currentColor"
                            strokeWidth="1.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.walletMenuItem}
                    onClick={() => {
                      setWalletMenuOpen(false)
                      disconnect()
                    }}
                  >
                    <span>Disconnect</span>
                    <span className={styles.walletMenuIcon} aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <path
                          d="M6 3.5H4.5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2H6"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.5 4.5 13 8l-3.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M13 8H6.5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.walletMenuItem}
                    onClick={() => {
                      setWalletMenuOpen(false)
                      setAddressesOpen(true)
                    }}
                  >
                    <span>View wallet addresses</span>
                    <span className={styles.walletMenuIcon} aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <path
                          d="M2.75 4h7.5a2 2 0 0 1 2 2v6.25H4.75a2 2 0 0 1-2-2V4Z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M6 2.75h7.25a2 2 0 0 1 2 2V11"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                </div>,
                document.body
              )
            : null}
        </div>
        <button
          className={styles.menuButton}
          onClick={onMenuClick}
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? (
            <svg
              className={styles.menuIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          ) : (
            <svg
              className={styles.menuIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          )}
        </button>
      </div>

      <div
        className={`${styles.latestTx} ${
          txState.status === "pending" ? styles.latestTxPending : ""
        } ${txState.status === "error" ? styles.latestTxError : ""}`}
        data-visible={showTx ? "true" : "false"}
        aria-hidden={showTx ? "false" : "true"}
        onClick={() => {
          if (txState.hash) {
            window.open(
              getTxExplorerUrl(chainKey, txState.hash),
              "_blank",
              "noopener,noreferrer"
            )
          }
        }}
        role={txState.hash ? "button" : undefined}
        tabIndex={txState.hash ? 0 : -1}
        onKeyDown={(event) => {
          if (event.key === "Enter" && txState.hash) {
            window.open(
              getTxExplorerUrl(chainKey, txState.hash),
              "_blank",
              "noopener,noreferrer"
            )
          }
        }}
      >
        <div className={styles.latestIcon} />
        <div>
          <div className={styles.latestTitle}>{txTitle}</div>
          <div className={styles.latestHash}>{txDetail}</div>
        </div>
      </div>

      {connectOpen ? (
        <Suspense fallback={null}>
          <ConnectModal open onClose={() => setConnectOpen(false)} />
        </Suspense>
      ) : null}
      {addressesOpen ? (
        <Suspense fallback={null}>
          <WalletAddressesModal
            open
            onClose={() => setAddressesOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

export default TopBar
