// Fonte unica per la tassonomia doc_type della classificazione AI (B3).
// documents.doc_type è TEXT libero (024_documents_ai_classification_columns.sql,
// deliberatamente non enum/CHECK): questa costante è il set di valori ammessi
// lato applicativo. Il mapping verso DocumentCategory è solo INFORMATIVO — non
// riscrive mai documents.category né il path storage, che restano congelati
// all'upload originale (legge di dominio, 024).
import type { DocumentCategory } from '@/types/database'

export type DocType =
  | 'dich_conformita_dm37'
  | 'ape'
  | 'manuale'
  | 'garanzia'
  | 'collaudo'
  | 'agibilita'
  | 'capitolato'
  | 'altro'

export const DOC_TYPES: DocType[] = [
  'dich_conformita_dm37',
  'ape',
  'manuale',
  'garanzia',
  'collaudo',
  'agibilita',
  'capitolato',
  'altro',
]

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  dich_conformita_dm37: 'Dichiarazione di conformità DM 37/08',
  ape: 'Attestato di prestazione energetica',
  manuale: 'Manuale',
  garanzia: 'Garanzia',
  collaudo: 'Collaudo',
  agibilita: 'Agibilità',
  capitolato: 'Capitolato',
  altro: 'Altro',
}

// null = nessun mapping (fallback 'altro', o doc_type non riconducibile a una categoria).
export const DOC_TYPE_TO_CATEGORY: Record<DocType, DocumentCategory | null> = {
  dich_conformita_dm37: 'conformita',
  ape: 'energetici',
  manuale: 'tecnici',
  garanzia: 'tecnici',
  collaudo: 'tecnici',
  agibilita: 'amministrativi',
  capitolato: 'tecnici',
  altro: null,
}

// Sotto soglia → classification_status 'da_revisionare' anche se la chiamata
// AI ha prodotto un doc_type valido (coda di revisione umana, commit 4/5).
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8
