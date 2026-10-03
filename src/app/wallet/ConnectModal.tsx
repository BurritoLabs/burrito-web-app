import { createPortal } from "react-dom"
import { useEffect, useId, useRef, useState } from "react"
import styles from "./ConnectModal.module.css"
import { useWallet } from "./WalletContext"
import {
  getWalletConnectorBadge,
  getWalletConnectorLabel
} from "./walletMeta"
import { useAppChain } from "../appChainContext"
import { getAddressExplorerUrl } from "../explorer"
import { preloadWalletRuntime } from "./walletRuntimeLoader"

type ConnectModalProps = {
  open: boolean
  onClose: () => void
}

const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const ConnectModal = ({ open, onClose }: ConnectModalProps) => {
  const { chain, chainKey } = useAppChain()
  const { connectors, connect, status, account, connectorId, error, disconnect } =
    useWallet()
  const isConnecting = status === "connecting"
  const [copied, setCopied] = useState(false)
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const modal = modalRef.current
    if (!modal) return
    const previousFocus = document.activeElement
    modal.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        // Closing this UI does not cancel an approval already sent to a wallet.
        closeRef.current()
        return
      }
      if (event.key !== "Tab") return
      const controls = [...modal.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]"
      )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      const active = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        modal.focus({ preventScroll: true })
      } else if (event.shiftKey && (active === first || active === modal || !modal.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || active === modal || !modal.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!connectors.some((connector) => connector.id === "keplr-mobile" && connector.available)) {
      return
    }
    preloadWalletRuntime()
  }, [connectors, open])

  const walletLabel = account?.name?.trim()
    ? account.name.trim()
    : getWalletConnectorLabel(connectorId)
  const walletBadge = getWalletConnectorBadge(connectorId)
  const finderUrl = account
    ? getAddressExplorerUrl(chainKey, account.address)
    : ""

  if (!open) return null

  if (typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <div className={styles.title} id={titleId}>Connect wallet</div>
            <div className={styles.subtitle}>{chain.name}</div>
          </div>
          <button
            aria-label="Close"
            className={styles.closeButton}
            type="button"
            onClick={onClose}
          >
            <span />
            <span />
          </button>
        </div>

        {account ? (
          <>
            <div className={styles.connected}>
              <div className={styles.connectedInfo}>
                <span className={styles.connectedIcon}>{walletBadge}</span>
                <div className={styles.connectedText}>
                  <div className={styles.connectedLabel}>Connected</div>
                  <div className={styles.connectedName} title={walletLabel}>
                    {walletLabel}
                  </div>
                  <div className={styles.connectedAddress}>
                    {shortenAddress(account.address)}
                  </div>
                </div>
              </div>
              <button
                className="uiButton uiButtonOutline"
                type="button"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
            <div className={styles.connectedActions}>
              <a
                className={styles.actionLink}
                href={finderUrl}
                target="_blank"
                rel="noreferrer"
              >
                View account address
              </a>
              <button
                type="button"
                className={styles.actionButton}
                onClick={async () => {
                  if (!account) return
                  await navigator.clipboard.writeText(account.address)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>
          </>
        ) : null}

        <div className={styles.list}>
          {connectors.map((connector) => (
            <button
              key={connector.id}
              className={styles.walletRow}
              type="button"
              disabled={!connector.available || isConnecting}
              onFocus={
                connector.id === "keplr-mobile" ? preloadWalletRuntime : undefined
              }
              onPointerEnter={
                connector.id === "keplr-mobile" ? preloadWalletRuntime : undefined
              }
              onClick={() => connect(connector.id)}
            >
              <div>
                <div className={styles.walletName}>{connector.label}</div>
                <div className={styles.walletMeta}>
                  {connector.type === "mobile" ? "Mobile" : "Extension"}
                </div>
              </div>
              {!connector.available ? (
                <span className={styles.walletBadge}>Unavailable</span>
              ) : null}
            </button>
          ))}
        </div>

        {isConnecting && connectorId === "burrito-extension" ? (
          <div className={styles.connectionHint} role="status">
            Continue in Burrito Wallet. Finish or cancel the request there before
            switching networks. Closing this panel does not cancel the request.
          </div>
        ) : null}
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </div>
    </div>,
    document.body
  )
}

export default ConnectModal
