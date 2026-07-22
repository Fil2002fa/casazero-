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

// Asse `sistema` — a QUALE impianto si riferisce un documento (prerequisito B4:
// "manca la conformità dell'impianto termico"). Ortogonale a doc_type: un
// edificio ha più impianti, ciascuno con le proprie dich. conformità/collaudi/
// manuali/garanzie. Vive in extracted_metadata (jsonb), NON è una colonna né
// tocca doc_type/category/path (nessuna migrazione). null quando il documento
// non riguarda un impianto specifico o in caso di dubbio: mai indovinare, un
// valore inventato genererebbe falsi "mancanti" in B4.
export type Sistema =
  | 'elettrico'
  | 'termico'
  | 'gas'
  | 'idrico_sanitario'
  | 'antincendio'
  | 'ascensore'
  | 'fotovoltaico'
  | 'vmc'
  | 'altro'

export const SISTEMI: Sistema[] = [
  'elettrico',
  'termico',
  'gas',
  'idrico_sanitario',
  'antincendio',
  'ascensore',
  'fotovoltaico',
  'vmc',
  'altro',
]

export const SISTEMA_LABELS: Record<Sistema, string> = {
  elettrico:        'Impianto elettrico',
  termico:          'Impianto termico',
  gas:              'Impianto gas',
  idrico_sanitario: 'Impianto idrico-sanitario',
  antincendio:      'Impianto antincendio',
  ascensore:        'Ascensore',
  fotovoltaico:     'Impianto fotovoltaico',
  vmc:              'VMC (ventilazione meccanica)',
  altro:            'Altro impianto',
}

// Stati della pipeline di classificazione (025_documents_classification_status_review.sql,
// CHECK su documents.classification_status). Fonte unica del tipo lato TS.
export type ClassificationStatus =
  | 'non_classificato'
  | 'in_corso'
  | 'completata'
  | 'da_revisionare'
  | 'fallita'
