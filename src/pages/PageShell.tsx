import type { PropsWithChildren, ReactNode } from "react"
import { Link } from "react-router-dom"
import styles from "./PageShell.module.css"

type PageShellProps = PropsWithChildren<{
  title: string
  extra?: ReactNode
  small?: boolean
  banner?: ReactNode
  backTo?: string
  backLabel?: string
}>

const PageShell = ({
  title,
  extra,
  small,
  banner,
  backTo,
  backLabel = "Back",
  children
}: PageShellProps) => {
  return (
    <section
      className={`${styles.page} ${small ? styles.small : ""} ${
        banner ? styles.withBanner : ""
      }`}
    >
      {banner ? <div className={styles.banner}>{banner}</div> : null}
      <div className={styles.grid}>
        <header className={styles.header}>
          <div className={styles.titleWrapper}>
            {backTo ? (
              <Link
                className={styles.backButton}
                to={backTo}
                aria-label={backLabel || "Back"}
              >
                <span className={styles.backIcon} aria-hidden="true" />
                {backLabel ? <span className={styles.backLabel}>{backLabel}</span> : null}
              </Link>
            ) : null}
            <h1 className={styles.title}>{title}</h1>
          </div>
          {extra ? <div className={styles.extra}>{extra}</div> : null}
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </section>
  )
}

export default PageShell
