import styles from "./DataErrorCard.module.css"

type DataErrorCardProps = {
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
}

const DataErrorCard = ({
  title = "Something went wrong.",
  message = "Reload the app and try again.",
  actionLabel = "Reload",
  onAction
}: DataErrorCardProps) => (
  <div className={styles.shell} role="alert">
    <div className={styles.card}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>
      {onAction ? (
        <button className={styles.button} type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  </div>
)

export default DataErrorCard
