import type { GovTallyParams } from "../../app/data/classic"
import { formatPercentPlain } from "../../app/governance/proposalFormat"
import styles from "../ProposalDetails.module.css"

type ProposalTallyProcedureProps = {
  tallyParams?: GovTallyParams
}

const ProposalTallyProcedure = ({ tallyParams }: ProposalTallyProcedureProps) => (
  <div className={`card ${styles.tallyCard}`}>
    <div className={styles.tallyHeader}>Tallying procedure</div>
    <div className={styles.tallyBody}>
      <div className={styles.tallyItem}>
        <div className={styles.tallyLabel}>Quorum</div>
        <div className={styles.tallyValue}>
          {tallyParams
            ? formatPercentPlain((tallyParams.quorum ?? 0) * 100)
            : "--"}
        </div>
      </div>
      <div className={styles.tallyItem}>
        <div className={styles.tallyLabel}>Pass threshold</div>
        <div className={styles.tallyValue}>
          {tallyParams
            ? formatPercentPlain((tallyParams.threshold ?? 0) * 100)
            : "--"}
        </div>
      </div>
      <div className={styles.tallyItem}>
        <div className={styles.tallyLabel}>Veto threshold</div>
        <div className={styles.tallyValue}>
          {tallyParams
            ? formatPercentPlain((tallyParams.vetoThreshold ?? 0) * 100)
            : "--"}
        </div>
      </div>
    </div>
  </div>
)

export default ProposalTallyProcedure
