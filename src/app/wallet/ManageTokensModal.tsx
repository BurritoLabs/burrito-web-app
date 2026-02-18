import { useMemo } from "react"
import styles from "./ManageTokensModal.module.css"

type ManageTokenItem = {
  key: string
  symbol: string
  name?: string
  iconCandidates: string[]
  enabled: boolean
}

type ManageTokensModalProps = {
  open: boolean
  onClose: () => void
  items: ManageTokenItem[]
  search: string
  onSearchChange: (value: string) => void
  hideNonWhitelisted: boolean
  onToggleHideNonWhitelisted: () => void
  hideLowBalance: boolean
  onToggleHideLowBalance: () => void
  onToggleToken: (key: string) => void
}

const TokenIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [first, ...rest] = candidates
  const image = first ? (
    <img
      src={first}
      alt={symbol}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
      onError={(event) => {
        const target = event.currentTarget
        const next = rest.shift()
        if (next) {
          target.src = next
        } else {
          target.style.display = "none"
          target.parentElement?.classList.add(styles.tokenIconFallback)
        }
      }}
    />
  ) : null

  return <span className={styles.tokenIcon}>{image || symbol.slice(0, 1)}</span>
}

const ManageTokensModal = ({
  open,
  onClose,
  items,
  search,
  onSearchChange,
  hideNonWhitelisted,
  onToggleHideNonWhitelisted,
  hideLowBalance,
  onToggleHideLowBalance,
  onToggleToken
}: ManageTokensModalProps) => {
  const filtered = useMemo(() => {
    if (!search) return items
    const query = search.toLowerCase()
    return items.filter(
      (item) =>
        item.symbol.toLowerCase().includes(query) ||
        item.name?.toLowerCase().includes(query)
    )
  }, [items, search])

  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Manage tokens</div>
          <button className={styles.closeButton} type="button" onClick={onClose}>
            <span />
            <span />
          </button>
        </div>

        <div className={styles.searchRow}>
          <span className={styles.searchIcon} aria-hidden="true" />
          <input
            className={styles.searchInput}
            placeholder="Search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className={styles.filters}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={hideNonWhitelisted}
              onChange={onToggleHideNonWhitelisted}
            />
            <span>Hide non-whitelisted</span>
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={hideLowBalance}
              onChange={onToggleHideLowBalance}
            />
            <span>Hide low-balance</span>
          </label>
        </div>

        <div className={styles.list}>
          {filtered.map((item) => (
            <button
              key={item.key}
              type="button"
              className={styles.row}
              onClick={() => onToggleToken(item.key)}
            >
              <div className={styles.rowLeft}>
                <TokenIcon symbol={item.symbol} candidates={item.iconCandidates} />
                <div>
                  <div className={styles.symbol}>{item.symbol}</div>
                  {item.name ? (
                    <div className={styles.name}>{item.name}</div>
                  ) : null}
                </div>
              </div>
              <div
                className={`${styles.toggle} ${
                  item.enabled ? styles.toggleOn : styles.toggleOff
                }`}
              >
                {item.enabled ? "✓" : "+"}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { ManageTokenItem }
export default ManageTokensModal
