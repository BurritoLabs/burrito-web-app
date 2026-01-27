import { Fragment, useState } from "react"
import PageShell from "./PageShell"
import styles from "./Swap.module.css"

const SwapArrowIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    className={styles.swapArrowIcon}
    aria-hidden="true"
  >
    <path
      d="M12 5v14M6 13l6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const Swap = () => {
  const [bannerOpen, setBannerOpen] = useState(() => {
    if (typeof window === "undefined") return true
    return !window.localStorage.getItem("burritoSwapBannerClosed")
  })
  const banner = bannerOpen ? (
    <>
      <button
        className={styles.bannerClose}
        type="button"
        aria-label="Dismiss banner"
        onClick={() => {
          window.localStorage.setItem("burritoSwapBannerClosed", "true")
          setBannerOpen(false)
        }}
      >
        <span />
      </button>
      <div className={styles.bannerContent}>
        <h4>
          For Desktop app users, please migrate to Station Extension before Dec
          31, 2024
        </h4>
        <a
          className={styles.bannerButton}
          href="https://swgee.medium.com/c371a280b244"
          target="_blank"
          rel="noreferrer"
        >
          Learn more
        </a>
      </div>
    </>
  ) : null

  return (
    <PageShell title="Swap" small banner={banner}>
      <div className={styles.chainFilter}>
        <div className={`card ${styles.swapCard}`}>
          <div className={styles.swapWarning}>
            <span className={styles.warningIcon} aria-hidden="true" />
            <span>Leave coins to pay fees for subsequent transactions</span>
          </div>

          <div className={styles.swapForm}>
            <div className={styles.swapField}>
              <div className={styles.swapFieldCard}>
                <div className={styles.fieldHeader}>
                  <span>From</span>
                  <div className={styles.fieldMeta}>
                    <span>Balance --</span>
                    <button className={styles.maxButton} type="button">
                      Max
                    </button>
                  </div>
                </div>
                <div className={styles.fieldBody}>
                  <input placeholder="0.0" aria-label="From amount" />
                  <button className={styles.assetButton} type="button">
                    LUNC
                  </button>
                </div>
              </div>
              <div className={styles.fieldFooter}>$0.00</div>
            </div>

            <div className={styles.swapDivider}>
              <SwapArrowIcon />
            </div>

            <div className={styles.swapField}>
              <div className={styles.swapFieldCard}>
                <div className={styles.fieldHeader}>
                  <span>To</span>
                  <span className={styles.fieldMeta}>Balance --</span>
                </div>
                <div className={styles.fieldBody}>
                  <input placeholder="0.0" aria-label="To amount" />
                  <button className={styles.assetButton} type="button">
                    USTC
                  </button>
                </div>
              </div>
              <div className={styles.fieldFooter}>$0.00</div>
            </div>
          </div>

          <div className={styles.swapSettings}>
            <button className={styles.settingPill} type="button">
              Slippage 0.5%
            </button>
            <button className={styles.settingPill} type="button">
              Deadline 10m
            </button>
            <button className={styles.settingPill} type="button">
              Fee --
            </button>
          </div>

          <dl className={styles.swapDetails}>
            {[
              "Price impact",
              "Minimum received",
              "Slippage",
              "Liquidity venue",
              "Fee",
              "Route"
            ].map((label) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd>--</dd>
              </Fragment>
            ))}
          </dl>

          <button
            className={`uiButton uiButtonPrimary ${styles.submit}`}
            type="button"
          >
            Connect wallet
          </button>
        </div>
      </div>
    </PageShell>
  )
}

export default Swap
