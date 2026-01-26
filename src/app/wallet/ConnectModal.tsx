import styles from "./ConnectModal.module.css"
import { useWallet } from "./WalletProvider"

type ConnectModalProps = {
  open: boolean
  onClose: () => void
}

const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const ConnectModal = ({ open, onClose }: ConnectModalProps) => {
  const { connectors, connect, status, account, error, disconnect } = useWallet()
  const isConnecting = status === "connecting"

  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog">
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
          <div className={styles.connected}>
            <div>
              <div className={styles.connectedLabel}>Connected</div>
              <div className={styles.connectedAddress}>
                {shortenAddress(account.address)}
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
    </div>
  )
}

export default ConnectModal
