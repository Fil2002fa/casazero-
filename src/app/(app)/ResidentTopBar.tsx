'use client'

import { usePathname } from 'next/navigation'
import { showsResidentTopBar } from '@/lib/resident-top-bar'
import styles from './resident-top-bar.module.css'

// Montata una volta nel layout (app); visibile solo sulle route di
// showsResidentTopBar. Il sottotitolo arriva già composto dal server.
export function ResidentTopBar({ subtitle }: { subtitle: string }) {
  const pathname = usePathname()
  if (!showsResidentTopBar(pathname)) return null
  return (
    <header className={styles.appTop}>
      <span className={styles.brandMark} aria-hidden="true">CZ</span>
      <div>
        <div className={styles.brandName}>CasaZero</div>
        <p className={styles.brandSub}>{subtitle}</p>
      </div>
    </header>
  )
}
