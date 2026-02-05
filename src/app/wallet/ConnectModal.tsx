import { createPortal } from "react-dom"
import { useMemo, useState } from "react"
import styles from "./ConnectModal.module.css"
import { useWallet } from "./WalletProvider"

type ConnectModalProps = {
  open: boolean
  onClose: () => void
}

const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const ConnectModal = ({ open, onClose }: ConnectModalProps) => {
  const { connectors, connect, status, account, connectorId, error, disconnect } =
    useWallet()
  const isConnecting = status === "connecting"
  const [copied, setCopied] = useState(false)

  const walletLabel = useMemo(() => {
    if (account?.name?.trim()) return account.name.trim()
    const match = connectors.find((item) => item.id === connectorId)
    return match?.label ?? "Wallet"
  }, [account?.name, connectorId, connectors])
  const walletBadge =
    connectorId === "keplr" ? "K" : connectorId === "galaxy" ? "G" : "W"
  const finderUrl = account
    ? `https://finder.burrito.money/classic/address/${account.address}`
    : ""

  if (!open) return null

  if (typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Connect wallet</div>
            <div className={styles.subtitle}>Terra Classic</div>
          </div>
          <button className={styles.closeButton} type="button" onClick={onClose}>
            <span />
            <span />
          </button>
        </div>

        {account ? (
          <>
            <div className={styles.connected}>
              <div className={styles.connectedInfo}>
                <span className={styles.connectedIcon}>{walletBadge}</span>
                <div>
                  <div className={styles.connectedLabel}>Connected</div>
                  <div className={styles.connectedName}>{walletLabel}</div>
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

        {error ? <div className={styles.error}>{error}</div> : null}
      </div>
    </div>,
    document.body
  )
}

export default ConnectModal
