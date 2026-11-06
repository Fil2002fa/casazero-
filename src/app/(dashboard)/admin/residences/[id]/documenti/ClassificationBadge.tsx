import { Loader2 } from 'lucide-react'
import { DOC_TYPE_LABELS, SISTEMA_LABELS } from '@/lib/document-classification'
import { REVIEW_LABEL, type DocRow } from '@/lib/document-rows'

// Fonte unica per label + colore del badge di stato classificazione, riusata
// da ogni card. 'da_revisionare'/'fallita' non usano mai la parola "fallita"
// né linguaggio di scadenza (stessa filosofia dell'invariante promemoria).
// Colori dalla famiglia di 2ª generazione ammessa ai componenti nuovi
// (status-*/brand/neutral): mai semantic-* (Regola delle Due Generazioni,
// DESIGN.md). 'non_classificato' → nessun badge.
export function classificationBadgeInfo(
  doc: DocRow
): { label: string; className: string; spinner?: boolean } | null {
  switch (doc.classification_status) {
    case 'completata': {
      // sistema (impianto) accanto al doc_type quando presente — assi distinti,
      // il sistema qualifica il tipo, non lo sostituisce. Legge SOLO la colonna
      // confermata documents.sistema (regola B4: il display legge le colonne,
      // mai il verbale). Nessun fallback a extracted_metadata: la route la scrive
      // già in auto-conferma, e un fallback farebbe riapparire sulla card una
      // proposta AI che l'umano ha rifiutato scegliendo "Nessun impianto".
      const sistema = doc.sistema
      const base = doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] : 'Classificato'
      // 'altro' non soddisfa mai una voce di checklist (match per uguaglianza
      // in document-checklist.ts): 'completata' qui significa solo che la
      // revisione è chiusa, non che il documento conta per la consegna.
      // Stesso trattamento neutro di 'Non applicabile' (riga 871), mai il
      // colore di successo.
      if (doc.doc_type === 'altro') {
        return { label: 'Nessuna categoria', className: 'bg-neutral-600/7 text-neutral-600' }
      }
      return {
        label: sistema ? `${base} · ${SISTEMA_LABELS[sistema]}` : base,
        className: 'bg-brand-dark/8 text-brand-dark',
      }
    }
    case 'da_revisionare':
      return { label: REVIEW_LABEL, className: 'bg-semantic-amber-bg text-semantic-amber' }
    case 'fallita':
      // Non più "Errore, riprova": dopo il rollback a 'non_classificato' per
      // gli errori di servizio (route.ts), 'fallita' significa solo che
      // QUESTO documento non è classificabile nel merito — è già incluso in
      // pendingClassification, quindi "riprova" resta corretto.
      return { label: 'Non classificabile, riprova', className: 'bg-neutral-600/7 text-neutral-600' }
    case 'in_corso':
      return { label: 'Classificazione…', className: 'bg-neutral-600/7 text-neutral-600', spinner: true }
    case 'non_classificato':
      return null
  }
}

export function ClassificationBadge({ doc }: { doc: DocRow }) {
  const info = classificationBadgeInfo(doc)
  if (!info) return null
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${info.className}`}>
      {info.spinner && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
      {info.label}
    </span>
  )
}
