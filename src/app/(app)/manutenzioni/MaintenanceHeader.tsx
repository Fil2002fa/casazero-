import styles from './maintenance-v5.module.css'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export function MaintenanceHeader({ residenceName, unitLabel, backToList = false }: { residenceName: string; unitLabel: string; backToList?: boolean }) {
  return (
    <header className={styles.appTop}>
      {backToList ? <Link href="/manutenzioni" className={styles.detailHeaderBack} aria-label="Torna alle manutenzioni"><ChevronLeft size={19} aria-hidden="true" /></Link>
        : <span className={styles.brandMark} aria-hidden="true">CZ</span>}
      <div>
        <div className={styles.brandName}>CasaZero</div>
        <p className={styles.brandSub}>{[residenceName, unitLabel].filter(Boolean).join(' · ')}</p>
      </div>
    </header>
  )
}
