'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight, Download, Eye, FileText, Image as ImageIcon, Lock, Plus, Search, Trash2, Upload } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { pluralize } from '@/lib/pluralize'
import {
  RESIDENT_DOC_CATEGORIES,
  residentDocumentSheet,
  residentDocumentUrl,
  type ResidentDocItem,
} from '@/lib/resident-documents-view'
import {
  EMPTY_PAGE_FILTERS,
  documentsPageView,
  ownCountLabel,
  ownDocumentMeta,
  ownDocumentSheetRows,
  ownDocumentUrl,
  type OwnDocItem,
  type PageFilter,
} from '@/lib/resident-own-documents-view'
import {
  RESIDENT_DOC_ACCEPT,
  RESIDENT_DOC_BUCKET,
  RESIDENT_DOC_KINDS,
  RESIDENT_DOC_TITLE_MAX,
  formatFileSize,
  resolveResidentDocMime,
  residentDocDeclaredError,
  sanitizeResidentDocTitle,
  titleFromFileName,
} from '@/lib/resident-document-upload'
import type { ResidentDocKind } from '@/types/database'
import { confirmResidentDocument, createResidentUploadUrl, deleteResidentDocument } from './resident-actions'
import home from '../home.module.css'
import styles from './documenti.module.css'

// BottomSheet rilancia il suo effetto (focus sul primo elemento) quando cambia
// l'identità di onClose: una callback nuova a ogni render ruberebbe il focus
// mentre si scrive il titolo. Qui la callback resta la stessa per tutta la vita
// del foglio e legge sempre lo stato corrente.
function useStableClose(fn: () => void): () => void {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  return useCallback(() => ref.current(), [])
}

const PRIVATE_LINE ='Li vedete solo tu e chi vive con te. Non il costruttore, non l’amministratore.'

// Tutti i documenti sono già in memoria (le stringhe sono composte sul server):
// filtri e ricerca non passano dal server. `own` null = chi guarda non è un
// residente: nessuna sezione "I tuoi documenti" né caricamento.
export function DocumentiList({
  items,
  own,
  ownError = false,
  uploadSlot,
}: {
  items: ResidentDocItem[]
  own: OwnDocItem[] | null
  ownError?: boolean
  uploadSlot?: React.ReactNode
}) {
  const [filter, setFilter] = useState<PageFilter>(EMPTY_PAGE_FILTERS.filter)
  const [search, setSearch] = useState(EMPTY_PAGE_FILTERS.search)
  // Si tiene la chiave, non la voce: il foglio legge sempre dall'elenco corrente.
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [openOwnId, setOpenOwnId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const openItem = openKey === null ? null : items.find(i => i.key === openKey) ?? null
  const openOwn = openOwnId === null || !own ? null : own.find(i => i.id === openOwnId) ?? null
  const isResident = own !== null

  // Card verde, sezioni e righe: un solo calcolo sugli stessi due array.
  const view = useMemo(() => documentsPageView(items, own, { filter, search }), [items, own, filter, search])

  function clearFilters() {
    setFilter('all')
    setSearch('')
  }

  const filters: { value: PageFilter; label: string }[] = [
    { value: 'all', label: 'Tutti' },
    ...(isResident ? [{ value: 'mine' as const, label: 'I tuoi' }] : []),
    ...RESIDENT_DOC_CATEGORIES,
  ]

  return (
    <div className={`${home.home} pb-safe`}>
      <div>
        <div className={home.eyebrow}>La tua casa</div>
        <h1 className={home.pageTitle}>Documenti<span>.</span></h1>
        <p className={home.lead}>
          {isResident
            ? 'Quello che ti ha consegnato il costruttore e quello che aggiungi tu. Tutto in un posto.'
            : 'Quello che ti ha consegnato il costruttore. Tutto in un posto.'}
        </p>
      </div>

      {uploadSlot}

      <section className={home.overview} aria-label="Riepilogo documenti">
        <p>L&apos;archivio della tua casa</p>
        <h2>Tutte le carte, quando ti servono.</h2>
        <div className={home.counts}>
          <span><strong>{view.builderTotal}</strong> dal costruttore</span>
          {isResident && <span><strong>{view.ownTotal}</strong> {ownCountLabel(view.ownTotal)}</span>}
        </div>
        {isResident && (
          <button type="button" className={`${home.ovNext} ${styles.ovAdd}`} onClick={() => setUploading(true)}>
            <span className={styles.addSymbol} aria-hidden="true"><Plus size={19} /></span>
            <span className={home.ovBody}>
              <span className={home.ovTitle} style={{ display: 'block' }}>Aggiungi un documento tuo</span>
              <span className={home.ovSub} style={{ display: 'block' }}>Ricevute, garanzie, rapporti del tecnico</span>
            </span>
            <span className={home.arrow} aria-hidden="true"><ChevronRight size={17} /></span>
          </button>
        )}
      </section>

      <div className={styles.filters} role="group" aria-label="Filtra i documenti">
        {filters.map(f => (
          <button
            key={f.value}
            type="button"
            className={`${styles.filter}${filter === f.value ? ` ${styles.filterActive}` : ''}`}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
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

      {view.builderState === 'none' && (
        <section aria-label="Dal costruttore" style={{ marginTop: 25 }}>
          <div className={home.empty}>
            <strong>Nessun documento</strong>
            I documenti della tua casa compariranno qui appena caricati.
          </div>
        </section>
      )}

      {view.builderState === 'list' && view.builder && (
        <section aria-label="Dal costruttore">
          <div className={home.sectionHeader}>
            <h2 className={home.sectionTitle}>Dal costruttore</h2>
            <span className={home.sectionCount}>{pluralize(view.builder.visible, 'documento', 'documenti')}</span>
          </div>
          {view.builder.sections.map(section => (
            <div key={section.category}>
              <div className={styles.groupLabel}>{section.label}</div>
              <div className={home.listCard}>
                {section.items.map(item => <DocRow key={item.key} item={item} onOpen={() => setOpenKey(item.key)} />)}
              </div>
            </div>
          ))}
        </section>
      )}

      {isResident && ownError && (filter === 'all' || filter === 'mine') && (
        <section aria-label="I tuoi documenti">
          <div className={home.sectionHeader}>
            <h2 className={home.sectionTitle}>I tuoi documenti</h2>
          </div>
          <div className={home.empty}>
            <strong>I tuoi documenti non sono disponibili</strong>
            Non è stato possibile caricarli. Riprova tra poco.
          </div>
        </section>
      )}

      {!ownError && view.own.state === 'list' && (
        <section aria-label="I tuoi documenti">
          <div className={home.sectionHeader}>
            <h2 className={home.sectionTitle}>I tuoi documenti</h2>
            <span className={home.sectionCount}>{view.own.countLabel}</span>
          </div>
          <p className={styles.privateLine}><Lock size={14} aria-hidden="true" /><span>{PRIVATE_LINE}</span></p>
          <div className={home.listCard}>
            {view.own.items.map(item => <OwnRow key={item.id} item={item} onOpen={() => setOpenOwnId(item.id)} />)}
            <button type="button" className={styles.addRow} onClick={() => setUploading(true)}>
              <Plus size={15} aria-hidden="true" /> Aggiungi un documento
            </button>
          </div>
        </section>
      )}

      {!ownError && view.own.state === 'empty' && (
        <section aria-label="I tuoi documenti">
          <div className={home.sectionHeader}>
            <h2 className={home.sectionTitle}>I tuoi documenti</h2>
          </div>
          <div className={home.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><Upload size={22} /></span>
            <strong>Qui puoi tenere le tue carte</strong>
            Ricevute degli interventi, garanzie degli elettrodomestici, rapporti del tecnico. Li vedete solo tu e chi vive con te.
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginTop: 15 }} onClick={() => setUploading(true)}>
              <Plus size={15} aria-hidden="true" /> Aggiungi il primo documento
            </button>
          </div>
        </section>
      )}

      {view.nothing && !(ownError && (filter === 'all' || filter === 'mine')) && (
        <div className={home.empty} style={{ marginTop: 22 }}>
          <span className={styles.emptyIcon} aria-hidden="true"><Search size={22} /></span>
          <strong>Nessun documento trovato</strong>
          Prova con un&apos;altra parola o togli i filtri.
          {view.filtering && (
            <button type="button" className={styles.emptyBtn} onClick={clearFilters}>Mostra tutti i documenti</button>
          )}
        </div>
      )}

      {openItem && <DetailSheet item={openItem} onClose={() => setOpenKey(null)} />}
      {openOwn && <OwnSheet item={openOwn} onClose={() => setOpenOwnId(null)} />}
      {uploading && (
        <UploadSheet
          onClose={() => setUploading(false)}
          onDone={() => {
            setUploading(false)
            clearFilters()
          }}
        />
      )}
    </div>
  )
}

// Area principale (apre il foglio) e scarico sono due elementi fratelli, mai
// uno dentro l'altro. L'icona scarica la versione più recente.
function DocRow({ item, onOpen }: { item: ResidentDocItem; onOpen: () => void }) {
  const latest = item.versions[0]
  return (
    <div className={styles.docRow}>
      <button
        type="button"
        className={styles.docMain}
        aria-haspopup="dialog"
        aria-label={`Dettagli di ${item.title}`}
        onClick={onOpen}
      >
        <div className={`${home.symbol} ${home.docIco} ${styles.rowSymbol}`} aria-hidden="true"><FileText size={19} /></div>
        <div className={home.lrBody}>
          <div className={`${home.lrTitle} ${home.lrClamp}`} title={item.fileName}>{item.title}</div>
          <div className={styles.docMeta}>
            <span>{item.subtitle}</span>
            {item.versionsLabel && <span className={styles.ver}>{item.versionsLabel}</span>}
          </div>
        </div>
      </button>
      <a className={styles.iconBtn} href={residentDocumentUrl(latest.storagePath)} aria-label={`Scarica ${item.title}`}>
        <Download size={18} aria-hidden="true" />
      </a>
    </div>
  )
}

function OwnRow({ item, onOpen }: { item: OwnDocItem; onOpen: () => void }) {
  const Icon = item.isImage ? ImageIcon : FileText
  return (
    <div className={styles.docRow}>
      <button
        type="button"
        className={styles.docMain}
        aria-haspopup="dialog"
        aria-label={`Dettagli di ${item.title}`}
        onClick={onOpen}
      >
        <div className={`${home.symbol} ${styles.mineIco} ${styles.rowSymbol}`} aria-hidden="true"><Icon size={19} /></div>
        <div className={home.lrBody}>
          <div className={`${home.lrTitle} ${home.lrClamp}`}>{item.title}</div>
          <div className={styles.docMeta}>
            <span className={styles.docType}>{item.kindLabel}</span>
            <span>{ownDocumentMeta(item)}</span>
          </div>
        </div>
      </button>
      <a className={styles.iconBtn} href={ownDocumentUrl(item.id)} aria-label={`Scarica ${item.title}`}>
        <Download size={18} aria-hidden="true" />
      </a>
    </div>
  )
}

// Foglio di dettaglio: i testi vengono tutti da residentDocumentSheet.
// BottomSheet gestisce portale, focus, Escape e ritorno del focus alla riga.
function DetailSheet({ item, onClose }: { item: ResidentDocItem; onClose: () => void }) {
  const sheet = residentDocumentSheet(item)
  const latest = item.versions[0]
  return (
    <BottomSheet open onClose={onClose} title={item.title} subtitle="Caricato dal costruttore.">
      <div className={styles.sheetBody}>
        <dl className={styles.kv}>
          {sheet.rows.map(r => (
            <div key={r.label} style={{ display: 'contents' }}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>

        {sheet.versionsTitle && (
          <>
            <span className={styles.fieldLabel} style={{ marginTop: 0 }}>{sheet.versionsTitle}</span>
            <ul className={styles.verList} style={{ listStyle: 'none', padding: 0 }}>
              {item.versions.map(v => (
                <li key={v.id} className={styles.verItem}>
                  <span>{v.dateLabel}{v.isLatest && <> <small>· più recente</small></>}</span>
                  <a href={residentDocumentUrl(v.storagePath)} aria-label={`Scarica la versione del ${v.dateLabel}`}>Scarica</a>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className={styles.sheetActions}>
          <a
            className={`${styles.btn} ${styles.btnPrimary}`}
            href={residentDocumentUrl(latest.storagePath, true)}
            target="_blank"
            rel="noopener"
          >
            <Eye size={15} aria-hidden="true" /> {sheet.openLabel}
          </a>
          <a className={`${styles.btn} ${styles.btnSecondary}`} href={residentDocumentUrl(latest.storagePath)}>
            <Download size={15} aria-hidden="true" /> Scarica
          </a>
        </div>
      </div>
    </BottomSheet>
  )
}

// Dettaglio di un documento del residente, con eliminazione in due passi.
// Qualunque membro attivo può eliminare un documento che vede (059).
function OwnSheet({ item, onClose }: { item: OwnDocItem; onClose: () => void }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteResidentDocument({ id: item.id })
      if (!result.ok) {
        setError(result.error)
        setBusy(false)
        router.refresh()
        return
      }
      setBusy(false)
      onClose()
      showToast('success', 'Documento eliminato.')
      router.refresh()
    } catch (err) {
      console.error('[documenti-pwa] eliminazione: chiamata fallita', err)
      setError('Non è stato possibile eliminare il documento. Controlla la connessione e riprova.')
      setBusy(false)
    }
  }

  const close = useStableClose(() => { if (!busy) onClose() })

  // key diversa: il foglio si rimonta e il focus va sul suo primo elemento,
  // invece di restare sul pulsante Elimina appena smontato.
  if (confirming) {
    return (
      <BottomSheet key="confirm" open onClose={close} title="Eliminare questo documento?">
        <div className={styles.sheetBody}>
          <p className={styles.sheetDesc}>
            «{item.title}» verrà tolto dall’archivio per te e per chi vive con te. Non si può recuperare.
          </p>
          {error && <ErrorLine message={error} />}
          <div className={styles.sheetActions} style={{ marginTop: 16 }}>
            <button type="button" className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={remove} disabled={busy}>
              <Trash2 size={15} aria-hidden="true" /> {busy ? 'Eliminazione in corso…' : 'Elimina'}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { setConfirming(false); setError(null) }} disabled={busy}>
              Tienilo
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet
      key="detail"
      open
      onClose={close}
      title={item.title}
      subtitle={<span className={styles.lockSub}><Lock size={14} aria-hidden="true" /> Documento tuo. Lo vedete solo tu e chi vive con te.</span>}
    >
      <div className={styles.sheetBody}>
        <dl className={styles.kv}>
          {ownDocumentSheetRows(item).map(r => (
            <div key={r.label} style={{ display: 'contents' }}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.sheetActions}>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={ownDocumentUrl(item.id, true)} target="_blank" rel="noopener">
            <Eye size={15} aria-hidden="true" /> Apri
          </a>
          <a className={`${styles.btn} ${styles.btnSecondary}`} href={ownDocumentUrl(item.id)}>
            <Download size={15} aria-hidden="true" /> Scarica
          </a>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setConfirming(true)}>
            <Trash2 size={15} aria-hidden="true" /> Elimina
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className={styles.err} role="alert">
      <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{message}</span>
    </div>
  )
}

type Picked = { file: File; mime: NonNullable<ReturnType<typeof resolveResidentDocMime>> }

// Foglio di caricamento: file (fotocamera o archivio: niente `capture`, così il
// telefono offre entrambe le scelte), tipo, titolo precompilato dal nome file.
// Tre passi: URL firmato (server) → upload diretto allo storage (browser) →
// conferma con controllo del file vero (server).
function UploadSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [kind, setKind] = useState<ResidentDocKind | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ready = picked !== null && kind !== null && sanitizeResidentDocTitle(title) !== '' && !busy

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const mime = resolveResidentDocMime(file.type, file.name)
    const declaredError = residentDocDeclaredError(mime, file.size)
    if (declaredError || !mime) {
      setPicked(null)
      setError(declaredError)
      return
    }
    setError(null)
    setPicked({ file, mime })
    if (!sanitizeResidentDocTitle(title)) setTitle(titleFromFileName(file.name))
  }

  async function upload() {
    if (!picked || !kind) return
    const cleanTitle = sanitizeResidentDocTitle(title)
    if (!cleanTitle) return
    setBusy(true)
    setError(null)
    try {
      const signed = await createResidentUploadUrl({ docKind: kind, mimeType: picked.mime, sizeBytes: picked.file.size })
      if (!signed.ok) {
        setError(signed.error)
        setBusy(false)
        return
      }
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from(RESIDENT_DOC_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, picked.file, { contentType: picked.mime })
      if (uploadError) {
        console.error('[documenti-pwa] upload allo storage fallito', uploadError)
        setError('Il file non è stato caricato. Controlla la connessione e riprova.')
        setBusy(false)
        return
      }
      const confirmed = await confirmResidentDocument({
        path: signed.path,
        docKind: kind,
        title: cleanTitle,
        mimeType: picked.mime,
        sizeBytes: picked.file.size,
      })
      if (!confirmed.ok) {
        setError(confirmed.error)
        setBusy(false)
        router.refresh()
        return
      }
      setBusy(false)
      onDone()
      showToast('success', 'Documento aggiunto. Lo vedete solo tu e chi vive con te.')
      router.refresh()
    } catch (err) {
      console.error('[documenti-pwa] caricamento: chiamata fallita', err)
      setError('Il caricamento non è riuscito. Controlla la connessione e riprova.')
      setBusy(false)
    }
  }

  const close = useStableClose(() => { if (!busy) onClose() })

  return (
    <BottomSheet open onClose={close} title="Aggiungi un documento" subtitle="Resta nel tuo archivio personale, accanto ai documenti del costruttore.">
      <div className={styles.sheetBody}>
        <span className={styles.fieldLabel} style={{ marginTop: 0 }}>File</span>
        {picked ? (
          <div className={styles.filePill}>
            <div className={`${home.symbol} ${styles.mineIco} ${styles.pillSymbol}`} aria-hidden="true">
              {picked.mime.startsWith('image/') ? <ImageIcon size={19} /> : <FileText size={19} />}
            </div>
            <div className={home.lrBody}>
              <div className={styles.fpName}>{picked.file.name}</div>
              <div className={styles.fpSize}>{formatFileSize(picked.file.size)}</div>
            </div>
            <button type="button" className={styles.fpChange} onClick={() => setPicked(null)} disabled={busy}>Cambia</button>
          </div>
        ) : (
          <label className={styles.drop}>
            <Upload size={22} aria-hidden="true" />
            <strong>Scegli un file o scatta una foto</strong>
            <small>PDF, JPG, PNG o WEBP · massimo 5 MB</small>
            <input type="file" accept={RESIDENT_DOC_ACCEPT} onChange={onFile} />
          </label>
        )}
        {error && <ErrorLine message={error} />}

        <span className={styles.fieldLabel} id="resdoc-kind">Che cos’è</span>
        <div className={styles.typeGrid} role="group" aria-labelledby="resdoc-kind">
          {RESIDENT_DOC_KINDS.map(k => (
            <button
              key={k.value}
              type="button"
              className={`${styles.filter}${kind === k.value ? ` ${styles.filterActive}` : ''}`}
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              disabled={busy}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className={styles.fieldLabel} htmlFor="resdoc-title">Titolo</label>
        <input
          id="resdoc-title"
          className={styles.textInput}
          maxLength={RESIDENT_DOC_TITLE_MAX}
          placeholder="Es. Ricevuta controllo caldaia"
          autoComplete="off"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={busy}
        />

        <div className={styles.noteInfo}>
          <Lock size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Lo vedete solo tu e chi vive con te. Il costruttore e l’amministratore non lo vedono.</span>
        </div>

        <div className={styles.sheetActions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={upload} disabled={!ready}>
            {busy ? 'Caricamento in corso…' : <><Upload size={15} aria-hidden="true" /> Carica documento</>}
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={close} disabled={busy}>Annulla</button>
        </div>
      </div>
    </BottomSheet>
  )
}
