import PageShell from "./PageShell"
import styles from "./Wallet.module.css"
import { useWallet } from "../app/wallet/WalletProvider"

const Wallet = () => {
  const { account } = useWallet()
  const subtitle = account
    ? "Balances update when your wallet is connected."
    : "Connect a wallet to view balances and activity."

  return (
    <PageShell title="Wallet">
      <div className={`cardGrid two ${styles.grid}`}>
        <div className="card">
          <div className="cardHeader">
            <span className="cardTitle">Portfolio value</span>
          </div>
          <div className={styles.value}>$0.00</div>
          <p className="cardText">{subtitle}</p>
          <div className="pillRow">
            <span>Send</span>
            <span>Receive</span>
            <span>Buy</span>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <span className="cardTitle">Assets</span>
            <button className="uiButton uiButtonOutline" type="button">
              Manage
            </button>
          </div>
          <div className={styles.assetList}>
            {[
              { symbol: "LUNC", name: "Terra Classic", value: "$0.00" },
              { symbol: "USTC", name: "Stablecoin", value: "$0.00" }
            ].map((asset) => (
              <div key={asset.symbol} className={styles.assetRow}>
                <div className={styles.assetInfo}>
                  <div className={styles.assetBadge}>{asset.symbol[0]}</div>
                  <div>
                    <div className={styles.assetName}>{asset.symbol}</div>
                    <div className={styles.assetMeta}>{asset.name}</div>
                  </div>
                </div>
                <div className={styles.assetValue}>{asset.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}

export default Wallet
