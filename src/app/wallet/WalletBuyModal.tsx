import { createPortal } from "react-dom"
import styles from "./WalletBuyModal.module.css"

const BUY_OPTIONS = {
  LUNC: {
    label: "Buy LUNC",
    venue: "Binance",
    pair: "LUNC / USDT",
    href: "https://www.binance.com/en/trade/LUNC_USDT?type=spot"
  },
  USTC: {
    label: "Buy USTC",
    venue: "Binance",
    pair: "USTC / USDT",
    href: "https://www.binance.com/en/trade/USTC_USDT?type=spot"
  },
  LUNA: {
    label: "Buy LUNA",
    venue: "Binance",
    pair: "LUNA / USDT",
    href: "https://www.binance.com/en/trade/LUNA_USDT?type=spot"
  }
} as const

export type WalletBuyAsset = keyof typeof BUY_OPTIONS

type WalletBuyModalProps = {
  open: boolean
  onClose: () => void
  assets: WalletBuyAsset[]
}

const WalletBuyModal = ({ open, onClose, assets }: WalletBuyModalProps) => {
  const canRender = open && typeof document !== "undefined"
  if (!canRender) return null
  const options = assets
    .map((asset) => BUY_OPTIONS[asset])
    .filter(Boolean)
  const title = options.length === 1 ? options[0].label : "Buy"

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close buy modal"
          >
            <span />
            <span />
          </button>
        </div>

        <div className={styles.optionList}>
          {options.map((option) => (
            <div key={option.pair} className={styles.optionCard}>
              <div className={styles.optionTop}>
                <div className={styles.optionLogo}>
                  <img src="/brand/binance.svg" alt="Binance" />
                </div>
                <div>
                  <div className={styles.optionTitleRow}>
                    <div className={styles.optionTitle}>{option.venue}</div>
                    <span className={styles.optionVenueTag}>Exchange</span>
                  </div>
                  <div className={styles.optionMeta}>{option.pair}</div>
                </div>
              </div>

              <a
                className={styles.primaryLink}
                href={option.href}
                target="_blank"
                rel="noreferrer"
              >
                Open {option.venue}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default WalletBuyModal
