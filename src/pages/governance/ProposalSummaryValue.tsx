import type { ReactNode } from "react"
import {
  formatTokenAmount,
  truncateHash
} from "../../app/utils/format"
import {
  formatDenom,
  isSummaryCoin
} from "../../app/governance/proposalFormat"
import styles from "../ProposalDetails.module.css"

export const renderProposalSummaryValue = (
  key: string,
  value: unknown
): ReactNode => {
  if (Array.isArray(value)) {
    if (!value.length) return "--"
    const first = value[0]
    if (isSummaryCoin(first)) {
      return value
        .filter(isSummaryCoin)
        .map((coin) =>
          `${formatTokenAmount(coin.amount, 6, 2)} ${formatDenom(coin.denom)}`
        )
        .join(", ")
    }
    return JSON.stringify(value)
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2)
  }
  if (value === undefined || value === null) return "--"
  const text = String(value)
  const isAddress =
    /^terra1[0-9a-z]{38,}$/.test(text) || /^terra[0-9a-z]{38,}$/.test(text)
  if (isAddress) {
    const href = `https://finder.burrito.money/classic/address/${text}`
    return (
      <a
        className={styles.summaryLink}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {truncateHash(text)}
      </a>
    )
  }
  if (key.toLowerCase() === "recipient" && text) {
    const href = `https://finder.burrito.money/classic/address/${text}`
    return (
      <a
        className={styles.summaryLink}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {truncateHash(text)}
      </a>
    )
  }
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return (
      <a
        className={styles.summaryLink}
        href={text}
        target="_blank"
        rel="noreferrer"
      >
        {text}
      </a>
    )
  }
  return text
}
