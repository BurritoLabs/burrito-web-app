import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Stake.module.css"

const Stake = () => {
  const tabs = [
    {
      key: "quick",
      label: "Quick stake",
      content: (
        <div className={styles.tabContent}>
          <div className="card">
            <div className="cardHeader">
              <div className="cardTitle">Quick stake</div>
            </div>
            <div className="cardDivider" />
            <div className="list dense">
              {["Burrito Node", "Allnodes", "Classic Labs"].map((name) => (
                <div key={name} className="listRow">
                  <strong>{name}</strong>
                  <span>APR --</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      key: "manual",
      label: "Manual stake",
      content: (
        <div className={styles.tabContent}>
          <div className="card">
            <div className="cardHeader">
              <div className="cardTitle">Validator list</div>
            </div>
            <div className="cardDivider" />
            <div className="list dense">
              {["Validator A", "Validator B", "Validator C"].map((name) => (
                <div key={name} className="listRow">
                  <strong>{name}</strong>
                  <span>Commission --</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <PageShell
      title="Stake"
      extra={
        <button className="uiButton uiButtonPrimary" type="button">
          Withdraw all rewards
        </button>
      }
    >
      <div className={styles.summaryGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chainHeader}>
            <div className={styles.chainTitle}>Staked funds</div>
            <div className={styles.chainPills}>
              <button
                className={`${styles.chainPill} ${styles.chainPillActive} ${styles.chainPillAll}`}
                type="button"
              >
                All
              </button>
              <button className={styles.chainPill} type="button">
                <span className={styles.chainPillIcon} aria-hidden="true" />
                Terra Classic
              </button>
            </div>
          </div>
          <div className={styles.chartContent}>
            <div className={styles.donut}>
              <span />
            </div>
            <div className={styles.chartMeta}>
              <div>
                <strong>--</strong>
                <span>Delegated</span>
              </div>
              <div>
                <strong>--</strong>
                <span>Rewards</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`card ${styles.stakedCard}`}>
          <div className="cardHeader">
            <div className="cardTitle">Staking overview</div>
          </div>
          <div className="cardDivider" />
          <div className="list dense">
            {[
              ["Delegations", "--"],
              ["Rewards", "--"],
              ["Unbonding", "--"],
              ["APR", "--"]
            ].map(([label, value]) => (
              <div key={label} className="listRow">
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} variant="page" />
    </PageShell>
  )
}

export default Stake
