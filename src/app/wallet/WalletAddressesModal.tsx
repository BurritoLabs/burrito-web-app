import { createPortal } from "react-dom"
import { useState } from "react"
import styles from "./WalletAddressesModal.module.css"
import { useWallet } from "./WalletProvider"

type WalletAddressesModalProps = {
  open: boolean
  onClose: () => void
}

const shortenAddress = (address: string) =>
  `${address.slice(0, 10)}...${address.slice(-6)}`

const WalletAddressesModal = ({ open, onClose }: WalletAddressesModalProps) => {
  const { account } = useWallet()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  if (!open) return null
  if (typeof document === "undefined") return null

  const address = account?.address ?? ""
  const qrUrl = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&color=52C41A&bgcolor=0C1411&data=${encodeURIComponent(
        address
      )}`
    : ""

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Wallet addresses</div>
          <button className={styles.closeButton} type="button" onClick={onClose}>
            <span />
            <span />
          </button>
        </div>

        <div className={styles.addressCard}>
          <div className={styles.chainLabel}>Terra Classic</div>
          <div className={styles.addressRow}>
            <span className={styles.addressText}>
              {address ? shortenAddress(address) : "--"}
            </span>
            <div className={styles.addressActions}>
              <button
                type="button"
                className={styles.copyButton}
                onClick={async () => {
                  if (!address) return
                  await navigator.clipboard.writeText(address)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className={styles.qrToggle}
                onClick={() => setShowQr(true)}
                aria-label="Show QR code"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 2h2v2h-2v-2Zm0-2h4v4h-2v-2h-2v-2Zm2 4h4v2h-4v-2Zm2-6h2v2h-2v-2Zm-2 0h-2v-2h2v2Zm4 4h-2v-2h2v2Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {qrUrl && showQr
          ? createPortal(
              <div
                className={styles.qrOverlay}
                onClick={() => setShowQr(false)}
              >
                <div
                  className={styles.qrModal}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className={styles.qrClose}
                    type="button"
                    onClick={() => setShowQr(false)}
                  >
                    <span />
                    <span />
                  </button>
                  <div className={styles.qrTitle}>Wallet address</div>
                  <div className={styles.qrBox}>
                    <img src={qrUrl} alt="Wallet address QR code" />
                  </div>
                  <div className={styles.qrAddress}>{address}</div>
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    </div>,
    document.body
  )
}

export default WalletAddressesModal
