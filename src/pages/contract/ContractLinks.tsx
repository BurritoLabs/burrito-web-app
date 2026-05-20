import { truncateHash } from "../../app/utils/format"
import styles from "../Contract.module.css"

type IconProps = {
  className?: string
}

export const SearchIcon = ({ className }: IconProps) => (
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

const LinkIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={className}>
    <path
      d="M8 16L16.5 7.5M10 7H17V14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const FinderAddressLink = ({
  address,
  className
}: {
  address: string
  className?: string
}) => (
  <a
    className={`${styles.addressLink} ${className ?? ""}`.trim()}
    href={`https://finder.burrito.money/classic/address/${address}`}
    target="_blank"
    rel="noreferrer"
  >
    <span className={styles.addressLinkText}>{truncateHash(address)}</span>
    <LinkIcon />
  </a>
)
