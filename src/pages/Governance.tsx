import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Governance.module.css"

const Governance = () => {
  const votingProposals = [
    { id: 112, type: "Text", title: "Upgrade roadmap" },
    { id: 113, type: "Parameter", title: "Validator incentives" },
    { id: 114, type: "Community", title: "Community pool" }
  ]

  const tabs = [
    {
      key: "voting",
      label: "Voting",
      content: (
        <div className={styles.proposals}>
          {votingProposals.map((proposal) => (
            <div
              key={proposal.id}
              className={`card ${styles.proposalCard}`}
            >
              <div className={styles.proposalTagRow}>
                <span className={styles.proposalTag}>
                  #{proposal.id} | {proposal.type}
                </span>
                <span className={`${styles.statusPill} ${styles.statusVoting}`}>
                  Voting
                </span>
              </div>
              <div className={styles.proposalHeader}>
                <div>
                  <strong>{proposal.title}</strong>
                  <span>Voting period - 7d left</span>
                </div>
                <button className="uiButton uiButtonOutline" type="button">
                  Vote
                </button>
              </div>
              <div className={styles.proposalMeta}>
                <span>Deposit: --</span>
                <span>Quorum: --</span>
                <span>Yes: --</span>
              </div>
            </div>
          ))}
        </div>
      )
    },
    {
      key: "deposit",
      label: "Deposit",
      content: (
        <div className={styles.proposals}>
          <div className={`card ${styles.proposalCard}`}>
            <div className={styles.proposalTagRow}>
              <span className={styles.proposalTag}>#115 | Community</span>
              <span className={`${styles.statusPill} ${styles.statusDeposit}`}>
                Deposit
              </span>
            </div>
            <div className={styles.proposalHeader}>
              <div>
                <strong>Community pool refill</strong>
                <span>Deposit period - 3d left</span>
              </div>
              <button className="uiButton uiButtonOutline" type="button">
                Deposit
              </button>
            </div>
            <div className={styles.proposalMeta}>
              <span>Deposit: --</span>
              <span>Required: --</span>
              <span>Yes: --</span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: "passed",
      label: "Passed",
      content: (
        <div className={styles.proposals}>
          <div className={`card ${styles.proposalCard}`}>
            <div className={styles.proposalTagRow}>
              <span className={styles.proposalTag}>#101 | Text</span>
              <span className={`${styles.statusPill} ${styles.statusPassed}`}>
                Passed
              </span>
            </div>
            <div className={styles.proposalHeader}>
              <div>
                <strong>Validator rewards update</strong>
                <span>Passed - 2d ago</span>
              </div>
            </div>
            <div className={styles.proposalMeta}>
              <span>Yes: --</span>
              <span>No: --</span>
              <span>Abstain: --</span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: "rejected",
      label: "Rejected",
      content: (
        <div className={styles.proposals}>
          <div className={`card ${styles.proposalCard}`}>
            <div className={styles.proposalTagRow}>
              <span className={styles.proposalTag}>#097 | Parameter</span>
              <span className={`${styles.statusPill} ${styles.statusRejected}`}>
                Rejected
              </span>
            </div>
            <div className={styles.proposalHeader}>
              <div>
                <strong>Reduce gas fees</strong>
                <span>Rejected - 1w ago</span>
              </div>
            </div>
            <div className={styles.proposalMeta}>
              <span>No: --</span>
              <span>Yes: --</span>
              <span>Abstain: --</span>
            </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <PageShell
      title="Governance"
      extra={
        <button className="uiButton uiButtonPrimary" type="button">
          New proposal
        </button>
      }
    >
      <Tabs tabs={tabs} variant="card" />
    </PageShell>
  )
}

export default Governance
