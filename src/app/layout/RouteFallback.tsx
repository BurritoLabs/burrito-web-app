import styles from "./RouteFallback.module.css"

const RouteFallback = () => {
  return (
    <div className={styles.shell} aria-label="Loading page" role="status">
      <div className={styles.panel}>
        <div className={styles.eyebrow}>
          <span className={styles.dot} aria-hidden="true" />
          <span>Loading page</span>
        </div>

        <div className={styles.hero} aria-hidden="true">
          <span className={styles.title} />
          <div className={styles.actions}>
            <span className={styles.chip} />
            <span className={styles.chip} />
          </div>
        </div>

        <div className={styles.grid} aria-hidden="true">
          <div className={styles.card}>
            <span className={styles.lineWide} />
            <span className={styles.line} />
            <span className={styles.line} />
            <span className={styles.blockTall} />
          </div>

          <div className={styles.stack}>
            <div className={styles.card}>
              <span className={styles.lineWide} />
              <span className={styles.line} />
              <span className={styles.block} />
            </div>

            <div className={styles.card}>
              <span className={styles.lineWide} />
              <span className={styles.line} />
              <span className={styles.lineShort} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RouteFallback
