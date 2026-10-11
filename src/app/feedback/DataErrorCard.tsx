import { useId } from "react"
import styles from "./DataErrorCard.module.css"

type DataErrorCardProps = {
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  secondaryActionDescription?: string
  secondaryActionPending?: boolean
  secondaryActionStatus?: string
  onSecondaryAction?: () => void
}

const DataErrorCard = ({
  title = "Something went wrong.",
  message = "Reload the app and try again.",
  actionLabel = "Reload",
  onAction,
  secondaryActionLabel,
  secondaryActionDescription,
  secondaryActionPending = false,
  secondaryActionStatus,
  onSecondaryAction
}: DataErrorCardProps) => {
  const descriptionId = useId()
  const statusId = useId()
  return (
    <div className={styles.shell} role="alert">
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        {onSecondaryAction && secondaryActionDescription ? (
          <p id={descriptionId} className={styles.description}>{secondaryActionDescription}</p>
        ) : null}
        {onAction || onSecondaryAction ? (
          <div className={styles.actions}>
            {onAction ? (
              <button className={styles.button} type="button" onClick={onAction}>
                {actionLabel}
              </button>
            ) : null}
            {onSecondaryAction ? (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={onSecondaryAction}
                disabled={secondaryActionPending}
                aria-busy={secondaryActionPending || undefined}
                aria-describedby={[
                  secondaryActionDescription ? descriptionId : undefined,
                  secondaryActionStatus ? statusId : undefined
                ].filter(Boolean).join(" ") || undefined}
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        {onSecondaryAction ? (
          <div id={statusId} role="status" aria-atomic="true">
            {secondaryActionStatus ? (
              <p className={styles.actionStatus}>{secondaryActionStatus}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default DataErrorCard
