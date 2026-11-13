'use client'

import { useMemo, useState } from 'react'
import { Download, FileText, Search } from 'lucide-react'
import { pluralize } from '@/lib/pluralize'
import {
  EMPTY_RESIDENT_DOC_FILTERS,
  RESIDENT_DOC_CATEGORIES,
  filterResidentDocuments,
  residentDocumentUrl,
  type CategoryFilter,
  type ResidentDocItem,
} from '@/lib/resident-documents-view'
import home from '../home.module.css'
import styles from './documenti.module.css'

// Tutti i documenti sono già in memoria (le stringhe sono composte sul server,
// vedi toResidentDocumentItems): filtri e ricerca non passano dal server.
export function DocumentiList({ items, uploadSlot }: { items: ResidentDocItem[]; uploadSlot?: React.ReactNode }) {
  const [category, setCategory] = useState<CategoryFilter>(EMPTY_RESIDENT_DOC_FILTERS.category)
  const [search, setSearch] = useState(EMPTY_RESIDENT_DOC_FILTERS.search)

  // Card verde, titolo di sezione e righe: un solo calcolo, un solo elenco.
  const view = useMemo(() => filterResidentDocuments(items, { category, search }), [items, category, search])

  function clearFilters() {
    setCategory('all')
    setSearch('')
  }

  const filters: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'Tutti' },
    ...RESIDENT_DOC_CATEGORIES,
  ]

  return (
    <div className={`${home.home} pb-safe`}>
      <div>
        <div className={home.eyebrow}>La tua casa</div>
        <h1 className={home.pageTitle}>Documenti<span>.</span></h1>
        <p className={home.lead}>Quello che ti ha consegnato il costruttore. Tutto in un posto.</p>
      </div>

      {uploadSlot}

      <section className={home.overview} aria-label="Riepilogo documenti">
        <p>L&apos;archivio della tua casa</p>
        <h2>Tutte le carte, quando ti servono.</h2>
        <div className={home.counts}>
          <span><strong>{view.total}</strong> dal costruttore</span>
        </div>
      </section>

      <div className={styles.filters} role="group" aria-label="Filtra i documenti">
        {filters.map(f => (
          <button
            key={f.value}
            type="button"
            className={`${styles.filter}${category === f.value ? ` ${styles.filterActive}` : ''}`}
            aria-pressed={category === f.value}
            onClick={() => setCategory(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true"><Search size={17} /></span>
        <input
          type="search"
          aria-label="Cerca documento"
          placeholder="Cerca un documento"
          autoComplete="off"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {view.empty === 'none' ? (
        <section aria-label="Dal costruttore" style={{ marginTop: 25 }}>
          <div className={home.empty}>
            <strong>Nessun documento</strong>
            I documenti della tua casa compariranno qui appena caricati.
          </div>
        </section>
      ) : view.empty === 'no-results' ? (
        <div className={home.empty} style={{ marginTop: 22 }}>
          <span className={styles.emptyIcon} aria-hidden="true"><Search size={22} /></span>
          <strong>Nessun documento trovato</strong>
          Prova con un&apos;altra parola o togli i filtri.
          {view.filtering && (
            <button type="button" className={styles.emptyBtn} onClick={clearFilters}>Mostra tutti i documenti</button>
          )}
        </div>
      ) : (
        <section aria-label="Dal costruttore">
          <div className={home.sectionHeader}>
            <h2 className={home.sectionTitle}>Dal costruttore</h2>
            <span className={home.sectionCount}>{pluralize(view.visible, 'documento', 'documenti')}</span>
          </div>
          {view.sections.map(section => (
            <div key={section.category}>
              <div className={styles.groupLabel}>{section.label}</div>
              <div className={home.listCard}>
                {section.items.map(item => <DocRow key={item.key} item={item} />)}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

// Area principale e scarico sono due link fratelli, mai uno dentro l'altro.
// L'area principale apre nel browser la versione più recente; il dettaglio con
// l'elenco delle versioni arriva con il foglio (commit successivo).
function DocRow({ item }: { item: ResidentDocItem }) {
  const latest = item.versions[0]
  return (
    <div className={styles.docRow}>
      <a
        className={styles.docMain}
        href={residentDocumentUrl(latest.storagePath, true)}
        target="_blank"
        rel="noopener"
        aria-label={`Apri ${item.title}`}
      >
        <div className={`${home.symbol} ${home.docIco} ${styles.rowSymbol}`} aria-hidden="true"><FileText size={19} /></div>
        <div className={home.lrBody}>
          <div className={`${home.lrTitle} ${home.lrClamp}`} title={item.fileName}>{item.title}</div>
          <div className={styles.docMeta}>
            <span>{item.subtitle}</span>
            {item.versionsLabel && <span className={styles.ver}>{item.versionsLabel}</span>}
          </div>
          {item.facts.length > 0 && <div className={home.lrSub}>{item.facts.join(' · ')}</div>}
        </div>
      </a>
      <a className={styles.iconBtn} href={residentDocumentUrl(latest.storagePath)} aria-label={`Scarica ${item.title}`}>
        <Download size={18} aria-hidden="true" />
      </a>
    </div>
  )
}
