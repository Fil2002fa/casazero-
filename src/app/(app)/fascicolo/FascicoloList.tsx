'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Building2, ChevronRight, Download, FileDown, FileText, Info, LockKeyhole, Paperclip, Search, Wrench } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button, buttonVariants } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import styles from './fascicolo.module.css'

type Attachment = { id: string; file_name: string; storage_path: string; mime_type: string | null }

// Date e anno arrivano dal server per evitare differenze di hydration con Safari.
export type FascicoloEntry = {
  id: string
  title: string
  category: string | null
  isCondominium: boolean
  dateStr: string
  year: number
  performedByName: string | null
  notes: string | null
  attachments: Attachment[]
}

type Scope = 'all' | 'unit' | 'condominium'
type Sheet = { kind: 'detail'; entry: FascicoloEntry } | { kind: 'export' } | { kind: 'attachment'; attachment: Attachment } | null
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'unit', label: 'Appartamento' },
  { value: 'condominium', label: 'Condominio' },
]
const downloadHref = (attachment: Attachment) => `/api/download?bucket=attachments&path=${encodeURIComponent(attachment.storage_path)}`

export function FascicoloList({ entries, reportHref }: { entries: FascicoloEntry[]; reportHref: string }) {
  const [scope, setScope] = useState<Scope>('all')
  const [year, setYear] = useState('all')
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const closeSheet = useCallback(() => setSheet(null), [])
  const years = useMemo(() => [...new Set(entries.map(entry => entry.year))].sort((a, b) => b - a), [entries])
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('it')
    return entries.filter(entry =>
      (scope === 'all' || (scope === 'condominium') === entry.isCondominium)
      && (year === 'all' || String(entry.year) === year)
      && [entry.title, entry.category, entry.performedByName, entry.notes, entry.id].join(' ').toLocaleLowerCase('it').includes(term)
    )
  }, [entries, scope, year, search])
  const groups = useMemo(() => years.map(value => ({
    year: value, entries: visible.filter(entry => entry.year === value),
  })).filter(group => group.entries.length), [years, visible])

  function resetFilters() {
    setScope('all')
    setYear('all')
    setSearch('')
  }

  return (
    <>
      <button type="button" className={styles.exportButton} onClick={() => setSheet({ kind: 'export' })}>
        <FileDown size={17} aria-hidden="true" /> Esporta il fascicolo in PDF
      </button>
      <section aria-labelledby="records-heading">
        <h2 id="records-heading" className={styles.sectionHeading}>Interventi registrati</h2>
        <p className={styles.sectionDescription}>Consulta lo storico oppure cerca un intervento specifico.</p>
        <div className={styles.filters} role="group" aria-label="Filtra per area">
          {SCOPES.map(option => (
            <button key={option.value} type="button" className={styles.filter} aria-pressed={scope === option.value} onClick={() => setScope(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Cerca un intervento</span>
            <input type="search" placeholder="Cerca un intervento" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <select className={styles.year} aria-label="Filtra per anno" value={year} onChange={event => setYear(event.target.value)}>
            <option value="all">Tutti gli anni</option>
            {years.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className={styles.resultLine}>
          <span role="status">{visible.length} {visible.length === 1 ? 'intervento trovato' : 'interventi trovati'}</span>
          <span><ArrowDownUp size={13} aria-hidden="true" /> Dal più recente</span>
        </div>
        {groups.length ? groups.map(group => (
          <section key={group.year} className={styles.yearGroup} aria-label={`Interventi ${group.year}`}>
            <h3 className={styles.yearTitle}>{group.year}</h3>
            <ul className={styles.records}>
              {group.entries.map(entry => (
                <li key={entry.id}>
                  <button type="button" className={styles.record} onClick={() => setSheet({ kind: 'detail', entry })} aria-label={`Apri ${entry.title}, ${entry.dateStr}`}>
                    <span className={styles.recordIcon}>{entry.isCondominium ? <Building2 size={17} aria-hidden="true" /> : <Wrench size={17} aria-hidden="true" />}</span>
                    <span className={styles.recordInfo}>
                      <span className={styles.recordDate}>{entry.dateStr}</span>
                      <span className={styles.recordTitle}>{entry.title}</span>
                      <span className={styles.recordMeta}>
                        <span>{entry.isCondominium ? 'Parti comuni' : 'Appartamento'}</span>
                        <span aria-hidden="true">·</span><span>{entry.performedByName}</span>
                        {entry.attachments.length > 0 && <span className={styles.paperclip}><Paperclip size={13} aria-hidden="true" /><span className="sr-only">Allegati: </span>{entry.attachments.length}</span>}
                      </span>
                    </span>
                    <ChevronRight size={15} className={styles.recordArrow} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )) : (
          <div className={styles.empty}>
            <Search size={27} aria-hidden="true" />
            <strong>{entries.length ? 'Nessun intervento trovato' : 'Nessun intervento registrato'}</strong>
            <p>{entries.length ? 'Prova a modificare la ricerca o i filtri.' : 'Gli interventi registrati saranno conservati qui nel tempo.'}</p>
            {entries.length > 0 && <Button variant="secondary" onClick={resetFilters}>Mostra tutti</Button>}
          </div>
        )}
      </section>
      <BottomSheet open={sheet !== null} onClose={closeSheet} title={sheet?.kind === 'detail' ? sheet.entry.title : sheet?.kind === 'attachment' ? 'Documento allegato' : 'Il tuo fascicolo PDF'}>
        <div className={styles.sheetContent}>
          {sheet?.kind === 'detail' && (
            <>
              <p className={styles.detailDate}>{sheet.entry.dateStr}</p>
              <p className={styles.detailIntro}>Intervento registrato nello storico della residenza.</p>
              <dl className={styles.fieldGrid}>
                <div><dt>Ambito</dt><dd>{sheet.entry.isCondominium ? 'Parti comuni' : 'Il tuo appartamento'}</dd></div>
                <div><dt>Registrato da</dt><dd>{sheet.entry.performedByName}</dd></div>
                <div><dt>Categoria</dt><dd>{sheet.entry.category || 'Non disponibile'}</dd></div>
                <div><dt>Riferimento</dt><dd>{sheet.entry.id}</dd></div>
              </dl>
              <section className={styles.sheetBlock}>
                <h3>Note sull’intervento</h3>
                <p>{sheet.entry.notes || 'Nessuna nota presente per questo intervento.'}</p>
              </section>
              <section className={styles.sheetBlock}>
                <h3>Allegati {sheet.entry.attachments.length > 0 && `(${sheet.entry.attachments.length})`}</h3>
                {sheet.entry.attachments.length ? sheet.entry.attachments.map(attachment => (
                  <div key={attachment.id} className={styles.attachmentRow}>
                    <button type="button" onClick={() => setSheet({ kind: 'attachment', attachment })} aria-label={`Apri ${attachment.file_name}`}>
                      <FileText size={20} aria-hidden="true" /><span>{attachment.file_name}</span><ChevronRight size={17} aria-hidden="true" />
                    </button>
                    <a href={downloadHref(attachment)} aria-label={`Scarica ${attachment.file_name}`}><Download size={18} aria-hidden="true" /></a>
                  </div>
                )) : <p>Nessun allegato presente per questo intervento.</p>}
              </section>
              <p className={styles.notice}><LockKeyhole size={17} aria-hidden="true" /><span>Questa registrazione è parte dello storico permanente. I dati originali non sono modificabili.</span></p>
            </>
          )}
          {sheet?.kind === 'export' && (
            <>
              <p className={styles.detailIntro}>Il report contiene tutti gli interventi del tuo appartamento e delle parti comuni, indipendentemente dai filtri che hai selezionato.</p>
              <p className={styles.notice}><Info size={17} aria-hidden="true" /><span>Il PDF include il registro permanente e il riepilogo delle manutenzioni monitorate.</span></p>
              <a href={reportHref} download className={buttonVariants('primary', 'default', styles.sheetAction)}><FileDown size={17} aria-hidden="true" /> Scarica il fascicolo PDF</a>
            </>
          )}
          {sheet?.kind === 'attachment' && <AttachmentPreview attachment={sheet.attachment} />}
          {sheet?.kind !== 'export' && <Button className={styles.sheetAction} onClick={closeSheet}>Chiudi {sheet?.kind === 'attachment' ? 'anteprima' : 'dettaglio'}</Button>}
        </div>
      </BottomSheet>
    </>
  )
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [preview, setPreview] = useState<{ url?: string; error?: string }>({})
  const supported = attachment.mime_type === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(attachment.mime_type ?? '')

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    async function load() {
      try {
        // Client di sessione: l'anteprima rispetta le stesse policy Storage del download.
        const { data, error } = await createClient().storage.from('attachments').createSignedUrl(attachment.storage_path, 300)
        if (error || !data) throw error ?? new Error('URL non disponibile')
        if (!cancelled) setPreview({ url: data.signedUrl })
      } catch {
        if (!cancelled) setPreview({ error: 'Non è stato possibile caricare l’anteprima. Puoi riprovare o scaricare il file.' })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [attachment.storage_path, supported])

  return (
    <>
      <p className={styles.attachmentName}>{attachment.file_name}</p>
      {!supported ? <p className={styles.notice}>Anteprima non disponibile per questo formato. Scarica il file per consultarlo.</p>
        : preview.error ? <p role="alert" className={styles.notice}>{preview.error}</p>
        : !preview.url ? <p role="status" className={styles.notice}>Caricamento anteprima…</p>
        : attachment.mime_type === 'application/pdf' ? <iframe title={`Anteprima ${attachment.file_name}`} src={preview.url} className={styles.preview} />
        // eslint-disable-next-line @next/next/no-img-element -- URL Storage firmato e temporaneo.
        : <img src={preview.url} alt={attachment.file_name} className={styles.previewImage} />}
      <a href={downloadHref(attachment)} className={buttonVariants('secondary', 'default', styles.sheetAction)}><Download size={17} aria-hidden="true" /> Scarica allegato</a>
    </>
  )
}
