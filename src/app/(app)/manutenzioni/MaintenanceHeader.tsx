import styles from './maintenance-v5.module.css'

export function MaintenanceHeader({ residenceName, unitLabel }: { residenceName: string; unitLabel: string }) {
  return (
    <header className={styles.appTop}>
      <span className={styles.brandMark} aria-hidden="true">CZ</span>
      <div>
        <div className={styles.brandName}>CasaZero</div>
        <p className={styles.brandSub}>{[residenceName, unitLabel].filter(Boolean).join(' · ')}</p>
      </div>
    </header>
  )
}
