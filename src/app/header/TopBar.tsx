import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import styles from "./TopBar.module.css"
import ConnectModal from "../wallet/ConnectModal"
import { useWallet } from "../wallet/WalletProvider"
import { CLASSIC_CHAIN } from "../chain"
import { fetchValidator } from "../data/classic"
import { convertBech32Prefix } from "../utils/bech32"

type TopBarProps = {
  onMenuClick?: () => void
  menuOpen?: boolean
}

const TopBar = ({ onMenuClick, menuOpen }: TopBarProps) => {
  const { account } = useWallet()
  const [connectOpen, setConnectOpen] = useState(false)
  const connectLabel = account
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
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
  const showValidator = Boolean(validator)

  return (
    <div className={styles.bar}>
      <div className={styles.leftRail}>
        <div className={styles.chainBadge}>Terra Classic</div>
      </div>
      <div className={styles.actions}>
        {showValidator ? (
          <button
            className={`uiButton uiButtonOutline ${styles.validatorButton}`}
            type="button"
          >
            Validator
          </button>
        ) : null}
        <button
          className={`uiButton uiButtonOutline ${styles.connectButton} ${
            account ? styles.connected : ""
          }`}
          type="button"
          onClick={() => setConnectOpen(true)}
        >
          {connectLabel}
        </button>
        <button
          className={styles.menuButton}
          onClick={onMenuClick}
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          data-open={menuOpen ? "true" : "false"}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={styles.latestTx} data-visible="false" aria-hidden="true">
        <div className={styles.latestIcon} />
        <div>
          <div className={styles.latestTitle}>Latest tx</div>
          <div className={styles.latestHash}>Waiting for activity</div>
        </div>
      </div>

      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}

export default TopBar
