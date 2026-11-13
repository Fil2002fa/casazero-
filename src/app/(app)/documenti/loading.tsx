import home from '../home.module.css'
import styles from './documenti.module.css'

// Scheletro con la stessa struttura della pagina (testata, card verde, filtri,
// ricerca, sezione con righe): niente salto di layout quando arrivano i dati.
// Barra in alto e navigazione restano quelle del layout.
export default function Loading() {
  return (
    <div className={`${home.home} pb-safe animate-pulse`} aria-busy="true" aria-label="Caricamento dei documenti">
      <div className="h-2.5 w-24 rounded bg-border" />
      <div className="mt-3 h-10 w-56 rounded bg-border" />
      <div className="mt-3 h-3 w-64 max-w-full rounded bg-border" />
      <div className="mt-2 h-3 w-40 rounded bg-border" />

      <div className="mt-[21px] h-[150px] rounded-[20px] bg-border" />

      <div className={styles.filters} aria-hidden="true">
        {[64, 92, 76, 84, 88, 104].map((w, i) => (
          <div key={i} className="h-9 flex-shrink-0 rounded-full bg-border" style={{ width: w }} />
        ))}
      </div>

      <div className="h-11 rounded-[13px] bg-border" />

      <div className="mt-[25px] mb-3 flex items-center justify-between">
        <div className="h-6 w-40 rounded bg-border" />
        <div className="h-3 w-20 rounded bg-border" />
      </div>
      <div className="mb-[9px] mt-4 h-2.5 w-24 rounded bg-border" />
      <div className={home.listCard}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={styles.docRow}>
            <div className={styles.docMain} aria-hidden="true">
              <div className="h-9 w-9 flex-shrink-0 rounded-[13px] bg-border" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-border" />
                <div className="h-2.5 w-1/2 rounded bg-border" />
              </div>
            </div>
            <div className="h-10 w-10 flex-shrink-0 rounded-[11px] bg-border" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  )
}
