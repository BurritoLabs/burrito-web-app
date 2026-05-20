import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from "react"
import styles from "../ProposalDetails.module.css"

type ProposalVoteFlagProps = {
  label: string
  left: number
}

const ProposalVoteFlag = ({ label, left }: ProposalVoteFlagProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    if (ref.current) {
      setWidth(ref.current.offsetWidth)
    }
  }, [label, left])

  let maxTranslate = 45
  if (label.toLowerCase().includes("quorum")) maxTranslate = 24
  const computed =
    (left / 100) * width < maxTranslate ? `-${(left / 100) * width}px` : "-50%"

  const flagStyle = {
    "--flag-left": `${left}%`,
    "--x-pos": computed
  } as CSSProperties

  return (
    <div ref={ref} className={styles.progressFlag} style={flagStyle}>
      <span className={styles.progressFlagLabel}>{label}</span>
      <span className={styles.progressFlagLine} />
    </div>
  )
}

export default ProposalVoteFlag
