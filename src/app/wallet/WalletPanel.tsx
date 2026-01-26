import { useEffect, useState } from "react"
import type { SVGProps } from "react"
import styles from "./WalletPanel.module.css"

type IconProps = SVGProps<SVGSVGElement>

const WalletCloseIcon = (props: IconProps) => (
  <svg viewBox="0 0 8 20" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M1.99984 0L0.589844 2.35L5.16984 10L0.589844 17.65L1.99984 20L7.99984 10L1.99984 0Z"
      fill="currentColor"
    />
  </svg>
)

const WalletIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9Zm-9-2h10V8H12v8Zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Z"
      fill="currentColor"
    />
  </svg>
)

const CloseIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M6 6l12 12M18 6l-12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

const SendIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M4 12h12M12 4l8 8-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ReceiveIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M20 12H8M12 20l-8-8 8-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const BuyIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

const ManageIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M4 7h10M4 12h16M4 17h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

const PriceUpIcon = (props: IconProps) => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 1.6C8.15828 1.6 7.80011 1.24183 7.80011 0.8C7.80011 0.358172 8.15828 0 8.60011 0H12.6001C13.0419 0 13.4001 0.358172 13.4001 0.8V4.8C13.4001 5.24183 13.0419 5.6 12.6001 5.6C12.1583 5.6 11.8001 5.24183 11.8001 4.8V2.73137L8.36579 6.16569C8.05337 6.47811 7.54684 6.47811 7.23442 6.16569L5.4001 4.33137L1.96578 7.76569C1.65336 8.0781 1.14683 8.0781 0.834412 7.76569C0.521993 7.45327 0.521993 6.94673 0.834412 6.63432L4.83442 2.63431C5.14684 2.3219 5.65337 2.3219 5.96579 2.63431L7.80011 4.46863L10.6687 1.6H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

const PriceDownIcon = (props: IconProps) => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 6.4C8.15828 6.4 7.80011 6.75817 7.80011 7.2C7.80011 7.64183 8.15828 8 8.60011 8H12.6001C13.0419 8 13.4001 7.64183 13.4001 7.2V3.2C13.4001 2.75817 13.0419 2.4 12.6001 2.4C12.1583 2.4 11.8001 2.75817 11.8001 3.2V5.26863L8.36579 1.83431C8.05337 1.52189 7.54684 1.52189 7.23442 1.83431L5.4001 3.66863L1.96578 0.234314C1.65336 -0.078105 1.14683 -0.078105 0.834412 0.234314C0.521993 0.546734 0.521993 1.05327 0.834412 1.36568L4.83442 5.36569C5.14684 5.6781 5.65337 5.6781 5.96579 5.36569L7.80011 3.53137L10.6687 6.4H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

const WalletPanel = () => {
  const [isOpen, setIsOpen] = useState(
    typeof window !== "undefined" && window.innerWidth > 992
  )
  const [view, setView] = useState<
    "wallet" | "send" | "receive" | "asset" | "buy"
  >("wallet")
  const [selectedAsset, setSelectedAsset] = useState({
    symbol: "LUNC",
    name: "Terra Classic"
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.innerWidth > 992) setIsOpen(true)
  }, [])

  const renderDetails = () => {
    if (view === "asset") {
      return (
        <div className={styles.details}>
          <div className={styles.assetDetails}>
            <div className={styles.assetBadgeLarge}>
              {selectedAsset.symbol.slice(0, 1)}
            </div>
            <div className={styles.assetDetailValue}>$0.00</div>
            <div className={styles.assetDetailAmount}>
              0.00 {selectedAsset.symbol}
            </div>
          </div>
        </div>
      )
    }

    if (view !== "wallet") return null

    return (
      <div className={styles.details}>
        <div className={styles.networthHeader}>
          <div>
            <div className={styles.kicker}>Portfolio value</div>
            <div className={styles.networthValue}>$0.00</div>
          </div>
        </div>

        <div className={styles.networthActions}>
          <div className={styles.actionItem}>
            <button
              className={`${styles.actionButton} ${styles.actionPrimary}`}
              type="button"
              onClick={() => setView("send")}
            >
              <SendIcon />
            </button>
            <span>Send</span>
          </div>
          <div className={styles.actionItem}>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => setView("receive")}
            >
              <ReceiveIcon />
            </button>
            <span>Receive</span>
          </div>
          <div className={styles.actionItem}>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => setView("buy")}
            >
              <BuyIcon />
            </button>
            <span>Buy</span>
          </div>
        </div>
      </div>
    )
  }

  const renderBody = () => {
    if (view === "send") {
      return (
        <div className={`${styles.formPanel} ${styles.sendPanel}`}>
          <div className={styles.formHeaderWrapper}>
            <h1>Send</h1>
          </div>
          <div className={styles.formContainer}>
            <div className={styles.formField}>
              <label>Asset</label>
              <button className={styles.assetSelect} type="button">
                LUNC
              </button>
            </div>
            <div className={styles.formField}>
              <label>Source chain</label>
              <div className={styles.chainSelector}>
                <button
                  className={`${styles.chainPill} ${styles.chainPillActive}`}
                  type="button"
                >
                  Classic
                </button>
                <button className={styles.chainPill} type="button">
                  Testnet
                </button>
              </div>
            </div>
            <div className={styles.formField}>
              <label>Recipient</label>
              <input placeholder="terra..." aria-label="Recipient" />
            </div>
            <div className={styles.formField}>
              <div className={styles.fieldHeader}>
                <label>Amount</label>
                <button className={styles.maxButton} type="button">
                  Max
                </button>
              </div>
              <div className={styles.amountRow}>
                <input placeholder="0.0" aria-label="Amount" />
                <button className={styles.assetButton} type="button">
                  LUNC
                </button>
              </div>
              <div className={styles.fieldHint}>Available: --</div>
            </div>
            <div className={styles.formField}>
              <label>Memo (optional)</label>
              <input placeholder="Optional" aria-label="Memo" />
            </div>
            <div className={styles.formWarning}>
              <span className={styles.warningIcon} aria-hidden="true" />
              <span>Check if this transaction requires a memo</span>
            </div>
            <div className={styles.formSummary}>
              <div className={styles.detailRow}>
                <span>Fee</span>
                <strong>--</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Estimated time</span>
                <strong>--</strong>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (view === "receive") {
      return (
        <div className={`${styles.formPanel} ${styles.receivePanel}`}>
          <h1 className={styles.formTitleLarge}>Receive</h1>
          <div className={styles.searchField}>
            <span className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search for a chain..."
              aria-label="Search for a chain"
            />
          </div>
          <div className={styles.addressTable}>
            {[
              { chain: "Terra Classic", address: "terra1..." },
              { chain: "Classic Testnet", address: "terra1..." }
            ].map((row) => (
              <div key={row.chain} className={styles.addressRow}>
                <div className={styles.addressChain}>
                  <span className={styles.chainDot} />
                  <span>{row.chain}</span>
                </div>
                <div className={styles.addressValue}>{row.address}</div>
                <button className={styles.addressButton} type="button">
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (view === "buy") {
      return (
        <div className={`${styles.formPanel} ${styles.receivePanel}`}>
          <h1 className={styles.formTitleLarge}>Buy</h1>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <div className={styles.formTitle}>Buy LUNC</div>
              <div className={styles.buyMeta}>Fiat on-ramp</div>
            </div>
            <div className={styles.buyList}>
              <button className={styles.buyRow} type="button">
                Kado - Open
              </button>
              <button className={styles.buyRow} type="button">
                Transak - Open
              </button>
              <button className={styles.buyRow} type="button">
                MoonPay - Open
              </button>
            </div>
            <button className="uiButton uiButtonOutline" type="button">
              Learn more
            </button>
          </div>
        </div>
      )
    }

    if (view === "asset") {
      return (
        <div className={styles.assetList}>
          <div className={styles.chainSectionContainer}>
            <div className={styles.chainSection}>
              <div className={styles.chainSectionTitle}>
                <h3>Chains</h3>
              </div>
              <div className={styles.chainSectionList}>
                {[
                  { name: "columbus-5", value: "--", amount: "--" },
                  { name: "classic-testnet", value: "--", amount: "--" }
                ].map((row) => (
                  <div key={row.name} className={styles.chainRowItem}>
                    <div className={styles.chainRowHeader}>
                      <span>{row.name}</span>
                    </div>
                    <div className={styles.chainRowValue}>{row.value}</div>
                    <div className={styles.chainRowAmount}>{row.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.assetList}>
        <div className={styles.assetHeader}>
          <div className={styles.assetTitle}>Assets</div>
          <button className={styles.manageButton} type="button">
            Manage
            <ManageIcon />
          </button>
        </div>

        <div className={styles.assetRows}>
          <div
            className={styles.assetRow}
            onClick={() => {
              setSelectedAsset({ symbol: "LUNC", name: "Terra Classic" })
              setView("asset")
            }}
          >
            <div className={styles.assetInfo}>
              <div className={styles.assetBadge}>L</div>
              <div className={styles.assetRowDetails}>
                <div className={styles.assetTopRow}>
                  <div className={styles.assetSymbol}>
                    <span className={styles.assetSymbolName}>LUNC</span>
                    <span className={styles.chainCount}>1</span>
                  </div>
                  <div className={styles.assetPrice}>$0.00</div>
                </div>
                <div className={styles.assetBottomRow}>
                  <div
                    className={`${styles.assetChange} ${styles.assetChangeUp}`}
                  >
                    <PriceUpIcon />
                    +0.00%
                  </div>
                  <div className={styles.assetAmount}>0.00 LUNC</div>
                </div>
              </div>
            </div>
          </div>
          <div
            className={styles.assetRow}
            onClick={() => {
              setSelectedAsset({ symbol: "USTC", name: "Stablecoin" })
              setView("asset")
            }}
          >
            <div className={styles.assetInfo}>
              <div className={styles.assetBadge}>U</div>
              <div className={styles.assetRowDetails}>
                <div className={styles.assetTopRow}>
                  <div className={styles.assetSymbol}>
                    <span className={styles.assetSymbolName}>USTC</span>
                    <span className={styles.chainCount}>1</span>
                  </div>
                  <div className={styles.assetPrice}>$0.00</div>
                </div>
                <div className={styles.assetBottomRow}>
                  <div
                    className={`${styles.assetChange} ${styles.assetChangeDown}`}
                  >
                    <PriceDownIcon />
                    -0.00%
                  </div>
                  <div className={styles.assetAmount}>0.00 USTC</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderActions = () => {
    if (view === "send") {
      return (
        <div className={styles.actions}>
          <button className="uiButton uiButtonPrimary" type="button">
            Review
          </button>
        </div>
      )
    }

    if (view === "asset") {
      return (
        <div className={styles.actions}>
          <button className="uiButton uiButtonPrimary" type="button">
            Send
          </button>
          <button className="uiButton uiButtonOutline" type="button">
            Receive
          </button>
        </div>
      )
    }

    return null
  }

  return (
    <aside className={`${styles.wallet} ${!isOpen ? styles.closed : ""}`}>
      <button
        className={styles.close}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Toggle wallet"
        type="button"
      >
        {isOpen ? (
          <>
            <WalletCloseIcon className={styles.closeIcon} />
            <CloseIcon className={styles.closeIconMobile} />
          </>
        ) : (
          <>
            <span>Wallet</span>
            <WalletIcon className={styles.walletIcon} />
          </>
        )}
      </button>
      {view !== "wallet" ? (
        <button
          className={styles.backButton}
          type="button"
          onClick={() => setView("wallet")}
          aria-label="Back to wallet"
        >
          <span />
        </button>
      ) : null}
      {renderDetails()}
      {renderBody()}
      {renderActions()}
    </aside>
  )
}

export default WalletPanel
