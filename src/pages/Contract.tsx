import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./Contract.module.css"
import { fetchContractInfo } from "../app/data/classic"
import { truncateHash } from "../app/utils/format"

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
  const trimmedAddress = address.trim()
  const isValidAddress = useMemo(
    () => /^terra1[0-9a-z]{38}$/.test(trimmedAddress),
    [trimmedAddress]
  )

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", trimmedAddress],
    queryFn: () => fetchContractInfo(trimmedAddress),
    enabled: isValidAddress
  })

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
          ) : !isValidAddress ? (
            <div className={`card ${styles.stateCard}`}>
              <div className={styles.stateIcon}>
                <SearchIcon />
              </div>
              <div className={styles.stateText}>Invalid contract address</div>
            </div>
          ) : (
            <div className={`card ${styles.resultCard}`}>
              <div className={styles.resultHeader}>
                <strong>Contract info</strong>
                <span>Address - {truncateHash(trimmedAddress)}</span>
              </div>
              <div className={styles.resultBody}>
                <div>
                  <span>Creator</span>
                  <strong>
                    {isLoading
                      ? "Loading..."
                      : contract?.creator
                        ? truncateHash(contract.creator)
                        : "--"}
                  </strong>
                </div>
                <div>
                  <span>Code ID</span>
                  <strong>{contract?.code_id ?? "--"}</strong>
                </div>
                <div>
                  <span>Admin</span>
                  <strong>
                    {contract?.admin ? truncateHash(contract.admin) : "--"}
                  </strong>
                </div>
                <div>
                  <span>Label</span>
                  <strong>{contract?.label ?? "--"}</strong>
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
