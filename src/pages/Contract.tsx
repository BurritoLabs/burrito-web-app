import { useState } from "react"
import PageShell from "./PageShell"
import styles from "./Contract.module.css"

type IconProps = {
  className?: string
}

const SearchIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" className={className}>
    <circle
      cx="11"
      cy="11"
      r="6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M16.5 16.5L21 21"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const Contract = () => {
  const [address, setAddress] = useState("")
  const hasAddress = address.trim().length > 0

  return (
    <PageShell
      title="Contract"
      extra={
        <>
          <button className="uiButton uiButtonPrimary" type="button">
            Upload
          </button>
          <button className="uiButton uiButtonPrimary" type="button">
            Instantiate
          </button>
        </>
      }
    >
      <div className={styles.contract}>
        <div className={styles.contractSearch}>
          <div className={styles.searchField}>
            <SearchIcon className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search by contract address"
              aria-label="Search by contract address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.contractBody}>
          {!hasAddress ? (
            <div className={`card ${styles.stateCard}`}>
              <div className={styles.stateIcon}>
                <SearchIcon />
              </div>
              <div className={styles.stateText}>Search by contract address</div>
            </div>
          ) : (
            <div className={`card ${styles.resultCard}`}>
              <div className={styles.resultHeader}>
                <strong>Contract info</strong>
                <span>Address - --</span>
              </div>
              <div className={styles.resultBody}>
                <div>
                  <span>Creator</span>
                  <strong>--</strong>
                </div>
                <div>
                  <span>Code ID</span>
                  <strong>--</strong>
                </div>
                <div>
                  <span>Admin</span>
                  <strong>--</strong>
                </div>
                <div>
                  <span>Label</span>
                  <strong>--</strong>
                </div>
              </div>
              <div className={styles.resultFooter}>
                <button className="uiButton uiButtonOutline" type="button">
                  Execute
                </button>
                <button className="uiButton uiButtonOutline" type="button">
                  Migrate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}

export default Contract
