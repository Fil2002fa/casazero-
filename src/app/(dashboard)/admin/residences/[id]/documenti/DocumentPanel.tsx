'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { DateField } from '@/components/DateField'
import { useToast } from '@/components/ui/Toast'
import { humanizeDocumentTitle } from '@/lib/documentTitle'
import { formatDateIT } from '@/lib/formatDate'
import { pluralize } from '@/lib/pluralize'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  SISTEMI,
  SISTEMA_LABELS,
  classificationConfidenceBand,
  type DocType,
  type Sistema,
} from '@/lib/document-classification'
import { CLASSI_ENERGETICHE, isExtractableDocType } from '@/lib/document-extraction'
import { MAX_TEXT_LENGTH, type CorrectionField } from '@/lib/document-overrides'
import {
  REVIEW_LABEL,
  correctionsLostOnTypeChange,
  type DocRow,
  type UnitRow,
} from '@/lib/document-rows'
import {
  differsFromAi,
  manualFieldKeys,
  panelFields,
  panelNeedsConfirmation,
  planPanelSave,
  readInDocumentText,
  savePlanIsEmpty,
} from '@/lib/document-panel'
import {
  clearDocumentFieldOverride,
  confirmClassification,
  saveDocumentFieldOverride,
  setDocumentUnit,
} from './actions'
import { DocumentPreview } from './DocumentPreview'

// Pannello laterale del documento (E1b): anteprima reale, tipo, UNITÀ (l'unico
// posto in cui si cambia), dati letti con il valore dell'AI come riferimento,
// un solo Salva. Un solo componente per admin e super_admin: il perimetro sta
// nelle action. Ambito e Unità di riferimento non sono campi: il testo letto
// nel documento si mostra in sola lettura.
//
// Il Salva esegue in ordine classificazione → unità → campi, ciascuna con la sua
// action (stesso perimetro e stesso registro attività di prima). Al primo errore
// si ferma e dice che cosa era già stato salvato, perché le tre scritture non
// sono atomiche.

const INPUT_CLASS =
  'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium'

const BAND_LABELS = { alta: 'Alta', media: 'Media', bassa: 'Bassa' } as const

function aiLabel(field: CorrectionField): string {
  if (field.ai === null) return 'non riportato'
  if (field.kind === 'date') return formatDateIT(field.ai)
  return field.ai
}

export function DocumentPanel({
  doc, units, correctedByNames, supplierSlot, onClose, onConfirmed,
}: {
  doc: DocRow
  units: UnitRow[]
  // id profilo → full_name di chi ha corretto a mano (048).
  correctedByNames: Record<string, string | null>
  // Proposta del fornitore dalle DiCo: la costruisce DocumentiClient (che ne
  // possiede il contesto, solo super_admin) e arriva qui già pronta o null.
  supplierSlot: ReactNode
  onClose: () => void
  // Chiamata SOLO a salvataggio riuscito che ha confermato la classificazione,
  // col tipo confermato: chi la riceve decide se far partire l'estrazione.
  onConfirmed: (docType: DocType) => void
}) {
  const router = useRouter()
  const { showToast } = useToast()

  const needsConfirmation = panelNeedsConfirmation(doc)
  const fields = panelFields(doc)
  const readText = readInDocumentText(doc)

  // I select di modifica partono dalla verità confermata (colonne) e solo se è
  // null dal verbale; il blocco "Proposta AI" legge sempre e solo il verbale
  // (regola B4 C2, vedi la storia di ReviewPanel).
  const [docType, setDocType] = useState<DocType>(doc.doc_type ?? doc.extracted_metadata?.doc_type ?? 'altro')
  const [sistema, setSistema] = useState<Sistema | ''>(doc.sistema ?? doc.extracted_metadata?.sistema ?? '')
  const [unitId, setUnitId] = useState(doc.unit_id ?? '')
  const [drafts, setDrafts] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map(f => [f.key, f.effective ?? ''])),
  )
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeChanged = docType !== doc.doc_type || (sistema === '' ? null : sistema) !== doc.sistema
  const lostCorrections = correctionsLostOnTypeChange(doc, docType)
  const manualKeys = manualFieldKeys(fields)

  const proposedUnit = doc.proposed_unit_id !== null && doc.unit_id === null && doc.unit_proposal_dismissed_at === null
    ? units.find(u => u.id === doc.proposed_unit_id) ?? null
    : null

  const metaConfidence = doc.extracted_metadata?.confidence
  const band = classificationConfidenceBand(metaConfidence ?? null)

  function setField(key: string, value: string) {
    setDrafts(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  async function handleSave() {
    setError(null)
    const plan = planPanelSave(doc, {
      docType,
      sistema: sistema === '' ? null : sistema,
      unitId: unitId === '' ? null : unitId,
      fields: drafts,
    })
    if (savePlanIsEmpty(plan)) {
      onClose()
      return
    }

    setSaving(true)
    const saved: string[] = []
    const fail = (what: string, message: string) => {
      setSaving(false)
      setError(saved.length > 0 ? `${what}: ${message} Già salvato: ${saved.join(', ')}.` : `${what}: ${message}`)
      if (saved.length > 0) router.refresh()
    }

    if (plan.classification) {
      const res = await confirmClassification({
        documentId: doc.id,
        docType,
        sistema: sistema === '' ? null : sistema,
      })
      if ('error' in res) return fail('Tipo', res.error)
      saved.push('tipo')
    }
    if (plan.unit) {
      const res = await setDocumentUnit({ documentId: doc.id, unitId: unitId === '' ? null : unitId })
      if ('error' in res) return fail('Unità', res.error)
      saved.push('unità')
    }
    for (const change of plan.fields) {
      const label = fields.find(f => f.key === change.key)?.label ?? change.key
      const res = change.action === 'clear'
        ? await clearDocumentFieldOverride({ documentId: doc.id, fieldKey: change.key })
        : await saveDocumentFieldOverride({ documentId: doc.id, fieldKey: change.key, value: change.value })
      if ('error' in res) return fail(label, res.error)
      saved.push(label.toLowerCase())
    }

    setSaving(false)
    showToast('success', 'Salvato')
    router.refresh()
    onClose()
    if (plan.classification && isExtractableDocType(docType)) onConfirmed(docType)
  }

  async function handleRestore() {
    setRestoring(true)
    setError(null)
    for (const key of manualKeys) {
      const res = await clearDocumentFieldOverride({ documentId: doc.id, fieldKey: key })
      if ('error' in res) {
        setRestoring(false)
        setError(res.error)
        router.refresh()
        return
      }
    }
    setRestoring(false)
    showToast('success', 'Valori AI ripristinati')
    router.refresh()
  }

  const busy = saving || restoring

  return (
    <aside
      aria-label={`Dettaglio: ${humanizeDocumentTitle(doc.title)}`}
      className="bg-surface rounded-xl border border-border p-4 space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-text-primary break-words">{humanizeDocumentTitle(doc.title)}</h2>
          <p className="text-xs text-text-secondary truncate">{doc.file_name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi dettaglio"
          className="p-1 rounded-lg text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
        >
          <X className="w-4 h-4" strokeWidth={1.6} />
        </button>
      </div>

      <DocumentPreview documentId={doc.id} title={humanizeDocumentTitle(doc.title)} className="h-[40vh]" />

      {needsConfirmation && (
        <div className="rounded-lg bg-status-inprogress/8 px-3 py-2 text-xs space-y-0.5" role="note">
          <p className="font-medium text-status-inprogress">{REVIEW_LABEL}: la classificazione va confermata.</p>
          {doc.extracted_metadata?.doc_type ? (
            <p className="text-text-secondary">
              Proposta AI: <span className="text-text-primary font-medium">{DOC_TYPE_LABELS[doc.extracted_metadata.doc_type]}</span>
              {doc.extracted_metadata.sistema && ` · ${SISTEMA_LABELS[doc.extracted_metadata.sistema]}`}
              {band && ` · confidenza ${BAND_LABELS[band]}`}
            </p>
          ) : (
            <p className="text-text-secondary">
              Nessuna proposta automatica
              {doc.extracted_metadata?.skipped_reason ? ` (${doc.extracted_metadata.skipped_reason})` : ''}.
            </p>
          )}
          {doc.extracted_metadata?.motivazione && (
            <p className="italic text-text-secondary">{doc.extracted_metadata.motivazione}</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={`panel-type-${doc.id}`} className="text-xs font-medium text-text-secondary block">Tipo</label>
          <select
            id={`panel-type-${doc.id}`}
            value={docType}
            onChange={e => { setDocType(e.target.value as DocType); setError(null) }}
            className={INPUT_CLASS}
          >
            {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`panel-sistema-${doc.id}`} className="text-xs font-medium text-text-secondary block">Impianto di riferimento</label>
          <select
            id={`panel-sistema-${doc.id}`}
            value={sistema}
            onChange={e => { setSistema(e.target.value as Sistema | ''); setError(null) }}
            className={INPUT_CLASS}
          >
            <option value="">Nessun impianto specifico</option>
            {SISTEMI.map(s => <option key={s} value={s}>{SISTEMA_LABELS[s]}</option>)}
          </select>
        </div>

        {lostCorrections > 0 && (
          <p className="text-xs text-semantic-amber">
            {pluralize(lostCorrections, 'correzione manuale non si applicherà più', 'correzioni manuali non si applicheranno più')} con
            questo tipo. Restano salvate e tornano attive se rimetti il tipo attuale.
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor={`panel-unit-${doc.id}`} className="text-xs font-medium text-text-secondary block">Unità</label>
          <select
            id={`panel-unit-${doc.id}`}
            value={unitId}
            onChange={e => { setUnitId(e.target.value); setError(null) }}
            className={INPUT_CLASS}
          >
            <option value="">Nessuna unità (documento della residenza)</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          {readText && (
            <p className="text-xs text-text-secondary">Letto nel documento: {readText}</p>
          )}
          {proposedUnit && unitId !== proposedUnit.id && (
            <p className="text-xs text-text-secondary">
              Proposta: {proposedUnit.label}
              {doc.unit_proposal_confidence && ` · ${BAND_LABELS[doc.unit_proposal_confidence]}`}{' '}
              <button
                type="button"
                onClick={() => { setUnitId(proposedUnit.id); setError(null) }}
                className="font-medium text-brand-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
              >
                Usa la proposta
              </button>
            </p>
          )}
          <p className="text-xs text-text-secondary">
            Un documento assegnato a un’unità non conta per i documenti attesi delle parti comuni e
            dell’amministrazione. Il file non viene spostato.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-text-secondary">Dati letti</h3>
          {fields.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-light text-brand-dark font-medium">Letto dall’AI</span>
          )}
        </div>

        {fields.length === 0 ? (
          <p className="text-xs text-text-secondary">
            {typeChanged
              ? 'I dati si leggeranno dal documento dopo il salvataggio, con il nuovo tipo.'
              : 'Nessun dato letto per questo documento.'}
          </p>
        ) : typeChanged ? (
          <p className="text-xs text-text-secondary">
            Cambiando il tipo i dati si leggeranno di nuovo dopo il salvataggio. I valori qui sotto non vengono modificati.
          </p>
        ) : (
          fields.map(field => {
            const manual = field.provenance.source === 'manuale' ? field.provenance : null
            const draft = drafts[field.key] ?? ''
            const modified = differsFromAi(field, draft)
            const inputId = `panel-field-${doc.id}-${field.key}`
            return (
              <div key={field.key} className="space-y-1">
                <label htmlFor={inputId} className="text-xs font-medium text-text-secondary block">{field.label}</label>
                {field.kind === 'date' ? (
                  <DateField name={field.key} id={inputId} defaultValue={field.effective ?? ''} onChange={v => setField(field.key, v)} />
                ) : field.kind === 'classe' ? (
                  <select id={inputId} value={draft} onChange={e => setField(field.key, e.target.value)} className={INPUT_CLASS}>
                    <option value="">Non riportata</option>
                    {CLASSI_ENERGETICHE.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    type="text"
                    inputMode={field.kind === 'int' || field.kind === 'vat' ? 'numeric' : undefined}
                    maxLength={field.kind === 'text' ? MAX_TEXT_LENGTH : undefined}
                    value={draft}
                    onChange={e => setField(field.key, e.target.value)}
                    className={INPUT_CLASS}
                  />
                )}
                <p className={`text-xs ${modified ? 'text-semantic-amber' : 'text-text-secondary'}`}>
                  Valore AI: {aiLabel(field)}
                </p>
                {manual && (
                  <p className="text-xs text-text-secondary">
                    Modificato a mano · {correctedByNames[manual.setBy] ? `${correctedByNames[manual.setBy]}, ` : ''}{formatDateIT(manual.setAt)}
                  </p>
                )}
              </div>
            )
          })
        )}

        {manualKeys.length > 0 && !typeChanged && (
          <button
            type="button"
            onClick={handleRestore}
            disabled={busy}
            className="text-xs font-medium text-brand-medium hover:underline disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
          >
            {restoring ? 'Ripristino…' : 'Ripristina valori AI'}
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-semantic-red">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-secondary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="flex-1 bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
        >
          {saving ? 'Salvataggio…' : needsConfirmation ? 'Conferma e salva' : 'Salva'}
        </button>
      </div>

      {supplierSlot}
    </aside>
  )
}
