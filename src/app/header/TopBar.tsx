import { useMemo, useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import styles from "./TopBar.module.css"
import ConnectModal from "../wallet/ConnectModal"
import WalletAddressesModal from "../wallet/WalletAddressesModal"
import { WalletIcon } from "../icons"
import { useWallet } from "../wallet/WalletProvider"
import { CLASSIC_CHAIN } from "../chain"
import { fetchValidator } from "../data/classic"
import { convertBech32Prefix } from "../utils/bech32"
import BrandLogo from "../../components/brand/BrandLogo"

type TopBarProps = {
  onMenuClick?: () => void
  menuOpen?: boolean
}

const TopBar = ({ onMenuClick, menuOpen }: TopBarProps) => {
  const navigate = useNavigate()
  const { account, txState, connectorId, disconnect } = useWallet()
  const [connectOpen, setConnectOpen] = useState(false)
  const [addressesOpen, setAddressesOpen] = useState(false)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
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
  const walletName =
    account?.name?.trim() ||
    (connectorId === "keplr"
      ? "Keplr"
      : connectorId === "galaxy"
      ? "Galaxy Station"
      : "")
  const connectLabel = account
    ? walletName ||
      `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : "Connect"
  const valoperAddress = useMemo(() => {
    if (!account?.address) return null
    return convertBech32Prefix(
      account.address,
      `${CLASSIC_CHAIN.bech32Prefix}valoper`
    )
  }, [account?.address])

  const { data: validator } = useQuery({
    queryKey: ["validator", valoperAddress],
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
        <div className={styles.chainBadge}>Terra Classic</div>
      </div>
      <div className={styles.actions}>
        {showValidator ? (
          <button
            className={`uiButton uiButtonOutline ${styles.validatorButton}`}
            type="button"
            onClick={() => navigate("/commission")}
            title={validatorMoniker}
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
              `https://finder.burrito.money/classic/tx/${txState.hash}`,
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
              `https://finder.burrito.money/classic/tx/${txState.hash}`,
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

      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      <WalletAddressesModal
        open={addressesOpen}
        onClose={() => setAddressesOpen(false)}
      />
    </div>
  )
}

export default TopBar
