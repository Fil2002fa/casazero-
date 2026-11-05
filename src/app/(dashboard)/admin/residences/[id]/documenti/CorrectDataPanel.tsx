'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AMBITI, AMBITO_LABELS, CLASSI_ENERGETICHE, type Ambito } from '@/lib/document-extraction'
import { MAX_TEXT_LENGTH, type CorrectionField } from '@/lib/document-overrides'
import { correctionFields, type DocRow } from '@/lib/document-rows'
import { formatDateIT } from '@/lib/formatDate'
import { DateField } from '@/components/DateField'
import { saveDocumentFieldOverride, clearDocumentFieldOverride } from './actions'

// Pannello "Correggi dati" (R10, D5). Un solo componente per admin e
// super_admin: il gate (estrazione corrente, tipo con campi correggibili) sta
// in canCorrectFields, il perimetro nelle action. Ogni campo mostra il valore
// AI come riferimento e si salva da solo; "Ripristina valore AI" cancella la
// correzione. Un campo lasciato vuoto e salvato vale "il documento non lo
// riporta", scelto a mano.

const INPUT_CLASS =
  'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium'

function aiLabel(field: CorrectionField): string {
  if (field.ai === null) return 'non riportato'
  if (field.kind === 'date') return formatDateIT(field.ai)
  if (field.kind === 'ambito') return AMBITO_LABELS[field.ai as Ambito] ?? field.ai
  return field.ai
}

export function CorrectDataPanel({ doc, correctedByNames }: {
  doc: DocRow
  // id profilo → full_name di chi ha corretto; null = profilo senza full_name.
  correctedByNames: Record<string, string | null>
}) {
  const fields = correctionFields(doc)
  return (
    <div className="mt-2 space-y-3 max-w-xl">
      <p className="text-xs text-text-secondary">
        Correggi i dati letti dal documento. Il valore dell’AI resta come riferimento e puoi ripristinarlo.
        Lascia un campo vuoto e salva se il documento non lo riporta.
      </p>
      {fields.map(field => {
        const manual = field.provenance.source === 'manuale' ? field.provenance : null
        // Cambia quando cambia il valore effettivo o la correzione: il campo si
        // rimonta con il valore aggiornato dopo router.refresh().
        const rowKey = `${field.key}:${field.effective ?? ''}:${manual ? manual.setAt : 'ai'}`
        return (
          <CorrectionRow
            key={rowKey}
            documentId={doc.id}
            field={field}
            setByName={manual ? (correctedByNames[manual.setBy] ?? null) : null}
          />
        )
      })}
    </div>
  )
}

function CorrectionRow({ documentId, field, setByName }: {
  documentId: string
  field: CorrectionField
  setByName: string | null
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(field.effective ?? '')
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputId = `corr-${documentId}-${field.key}`
  const manual = field.provenance.source === 'manuale' ? field.provenance : null
  const dirty = draft.trim() !== (field.effective ?? '')

  // Ogni modifica toglie l'errore del tentativo precedente: non resta a schermo
  // un messaggio su un valore che non c'è più.
  function edit(value: string) {
    setDraft(value)
    setError(null)
  }

  async function run(kind: 'save' | 'clear') {
    setBusy(kind)
    setError(null)
    const res = kind === 'save'
      ? await saveDocumentFieldOverride({ documentId, fieldKey: field.key, value: draft })
      : await clearDocumentFieldOverride({ documentId, fieldKey: field.key })
    setBusy(null)
    if ('error' in res) setError(res.error)
    else router.refresh()
  }

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="text-xs font-medium text-text-secondary block">{field.label}</label>
      {field.kind === 'date' ? (
        <DateField name={field.key} id={inputId} defaultValue={field.effective ?? ''} onChange={edit} />
      ) : field.kind === 'ambito' ? (
        <select id={inputId} name={field.key} value={draft} onChange={e => edit(e.target.value)} className={INPUT_CLASS}>
          <option value="">Non riportato</option>
          {AMBITI.map(a => <option key={a} value={a}>{AMBITO_LABELS[a]}</option>)}
        </select>
      ) : field.kind === 'classe' ? (
        <select id={inputId} name={field.key} value={draft} onChange={e => edit(e.target.value)} className={INPUT_CLASS}>
          <option value="">Non riportata</option>
          {CLASSI_ENERGETICHE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input
          id={inputId}
          name={field.key}
          type="text"
          inputMode={field.kind === 'int' || field.kind === 'vat' ? 'numeric' : undefined}
          maxLength={field.kind === 'text' ? MAX_TEXT_LENGTH : undefined}
          value={draft}
          onChange={e => edit(e.target.value)}
          className={INPUT_CLASS}
        />
      )}
      <p className="text-xs text-text-secondary">Valore AI: {aiLabel(field)}</p>
      {manual && (
        <p className="text-xs text-text-secondary">
          Modificato a mano · {setByName ? `${setByName}, ` : ''}{formatDateIT(manual.setAt)}
        </p>
      )}
      {error && <p className="text-xs text-semantic-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run('save')}
          disabled={!dirty || busy !== null}
          className="inline-flex items-center h-9 max-lg:h-11 px-3 rounded-lg bg-brand-dark text-white text-xs font-medium disabled:opacity-50"
        >
          {busy === 'save' ? 'Salvataggio…' : 'Salva'}
        </button>
        {manual && (
          <button
            type="button"
            onClick={() => run('clear')}
            disabled={busy !== null}
            className="inline-flex items-center h-9 max-lg:h-11 px-3 rounded-lg border border-border text-xs font-medium text-brand-medium hover:bg-background transition-colors disabled:opacity-50"
          >
            {busy === 'clear' ? 'Ripristino…' : 'Ripristina valore AI'}
          </button>
        )}
      </div>
    </div>
  )
}
