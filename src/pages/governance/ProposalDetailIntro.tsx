import type { ReactNode } from "react"
import type { ProposalItem } from "../../app/data/classic"
import { formatTimestamp } from "../../app/utils/format"
import styles from "../ProposalDetails.module.css"

type SummaryItem = {
  label: string
  value: ReactNode
}

type ProposalDetailIntroProps = {
  authors: unknown
  forumLabel: string
  forumUrl?: string
  parsedDescription: ReactNode[]
  proposal?: ProposalItem
  proposalTypeLabel: string
  showDetails: boolean
  statusClass: string
  statusLabel: string
  summaryItems: SummaryItem[]
  voteContext: unknown
  onToggleDetails: () => void
}

const ProposalDetailIntro = ({
  authors,
  forumLabel,
  forumUrl,
  parsedDescription,
  proposal,
  proposalTypeLabel,
  showDetails,
  statusClass,
  statusLabel,
  summaryItems,
  voteContext,
  onToggleDetails
}: ProposalDetailIntroProps) => (
  <div className={styles.detailGrid}>
    <div className={styles.mainColumn}>
      <div className={`card ${styles.detailCard}`}>
        <div className={styles.headerMeta}>
          <div className={styles.metaLeft}>
            <span>
              {proposal?.id ? `#${proposal.id}` : "--"} | {proposalTypeLabel}
            </span>
          </div>
          <span className={`${styles.statusPill} ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <h2 className={styles.detailTitle}>
          {proposal?.title ?? "Proposal"}
        </h2>
        <div className={styles.detailDate}>
          Submitted{" "}
          {proposal?.submitTime ? formatTimestamp(proposal.submitTime) : "--"}
        </div>
        <button
          className={styles.detailsToggle}
          type="button"
          onClick={onToggleDetails}
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
        {showDetails ? (
          <>
            <div className={styles.description}>{parsedDescription}</div>
            <div className={styles.detailsList}>
              {authors ? (
                <div className={styles.detailsRow}>
                  <div className={styles.detailsLabel}>Authors</div>
                  <div className={styles.detailsValue}>
                    {Array.isArray(authors) ? authors.join(", ") : String(authors)}
                  </div>
                </div>
              ) : null}
              {forumUrl ? (
                <div className={styles.detailsRow}>
                  <div className={styles.detailsLabel}>Proposal forum url</div>
                  <div className={styles.detailsValue}>
                    <a
                      className={styles.summaryLink}
                      href={forumUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {forumLabel || forumUrl}
                    </a>
                  </div>
                </div>
              ) : null}
              {voteContext ? (
                <div className={styles.detailsRow}>
                  <div className={styles.detailsLabel}>Vote option context</div>
                  <div className={styles.detailsValue}>{String(voteContext)}</div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>

    <div className={styles.sideColumn}>
      <div className={`card ${styles.summaryCard}`}>
        <div className={styles.summaryList}>
          {summaryItems.length ? (
            summaryItems.map((item) => (
              <div key={item.label} className={styles.summaryRow}>
                <div className={styles.summaryLabel}>{item.label}</div>
                <div className={styles.summaryValue}>{item.value}</div>
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>No details available.</div>
          )}
        </div>
      </div>
    </div>
  </div>
)

export default ProposalDetailIntro
