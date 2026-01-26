import type { PropsWithChildren } from "react"
import styles from "./PageShell.module.css"

type PageShellProps = PropsWithChildren<{
  title: string
  subtitle: string
  actionLabel?: string
}>

const PageShell = ({ title, subtitle, actionLabel, children }: PageShellProps) => {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Burrito Station</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actionLabel ? <button>{actionLabel}</button> : null}
      </header>
      <div className={styles.content}>{children}</div>
    </section>
  )
}

export default PageShell
