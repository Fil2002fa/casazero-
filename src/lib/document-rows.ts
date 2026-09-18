/**
 * Riga documento come la legge la pagina Documenti di residenza, con le
 * funzioni pure che ne ricavano i valori mostrati (estrazione corrente,
 * data in riga, fatti estratti, oggetto della validità). Spostate qui da
 * DocumentiClient.tsx senza modifiche perché la stessa riga alimenta due
 * superfici — lo schermo e l'export Excel (api/documenti-xlsx) — e un
 * modulo 'use client' non può essere importato da una route.
 * Fonte unica: nessuna superficie ricalcola questi valori inline.
 */
import type { DocumentCategory } from '@/types/database'
import { formatDateIT } from '@/lib/formatDate'
import {
  DOC_TYPE_LABELS,
  type DocType,
  type Sistema,
  type ClassificationStatus,
} from '@/lib/document-classification'
import {
  AMBITO_LABELS,
  isTypedDocType,
  extractionIsCurrent,
  validityFormula,
  type DocumentExtractionRow,
  type GaranziaFields,
  type ApeFields,
  type PolizzaFields,
} from '@/lib/document-extraction'

// Sottoinsieme letto di extracted_metadata (jsonb): la proposta AI completa,
// oppure una nota di skip. Tutti i campi opzionali — si legge in difesa.
// È il VERBALE della proposta AI (immutabile): doc_type/sistema qui sono
// ciò che ha detto la macchina, MAI la correzione umana (che vive nelle
// colonne documents.doc_type / documents.sistema).
export type ClassificationMetadata = {
  doc_type?: DocType
  sistema?: Sistema | null
  confidence?: number
  motivazione?: string
  unita_riferimento?: string | null
  skipped_reason?: string
  nota?: string
  // Impresa installatrice, valorizzata da route.ts SOLO per
  // dich_conformita_dm37 e azzerata per ogni altro doc_type. La P.IVA arriva
  // qui già normalizzata a sole cifre; la ragione sociale no, e può essere
  // stringa vuota. Restano parte del verbale: la conferma umana della
  // proposta fornitore non li riscrive mai.
  ragione_sociale_installatore?: string | null
  partita_iva_installatore?: string | null
}

export type DocRow = {
  id: string
  title: string
  category: DocumentCategory
  file_name: string
  storage_path: string
  file_date: string | null
  unit_id: string | null
  created_at: string
  classification_status: ClassificationStatus
  doc_type: DocType | null
  sistema: Sistema | null
  classification_confidence: number | null
  extracted_metadata: ClassificationMetadata | null
  // Estrazione dati (040, seconda chiamata AI): null = mai estratto. Vale
  // solo se for_doc_type coincide con doc_type (extractionIsCurrent): dopo
  // una riclassificazione umana la riga resta ma il documento torna "da
  // estrarre". Distinta da extracted_metadata, che è il verbale della
  // classificazione.
  extraction: DocumentExtractionRow | null
}

export type UnitRow = {
  id: string
  label: string
}

// Estrazione valida per il documento così com'è ORA: null se mai estratto,
// o se la riga è di un doc_type precedente (riclassificazione umana).
// Unica porta d'accesso ai dati estratti in questa pagina: nessun
// componente legge doc.extraction direttamente senza passare da qui.
export function currentExtraction(doc: DocRow): DocumentExtractionRow | null {
  return doc.extraction && extractionIsCurrent(doc, doc.extraction) ? doc.extraction : null
}

// Data mostrata in riga: la data del documento estratta, altrimenti quella
// inserita a mano all'upload, altrimenti la data di caricamento. Un solo
// ordine di fallback, qui, per contatore e riga.
export function displayDate(doc: DocRow): string {
  return currentExtraction(doc)?.document_date ?? doc.file_date ?? doc.created_at
}

export function hasValidity(doc: DocRow): boolean {
  const ext = currentExtraction(doc)
  if (!ext) return false
  return ext.valid_until !== null || validityFormula(doc.doc_type, ext.fields) !== null
}

// Fatti estratti da mostrare in riga, come brevi voci separate da " · ".
// Solo ciò che esiste: nessuna voce vuota, nessuna etichetta senza valore.
// L'installatore viene dal verbale di classificazione (extracted_metadata,
// solo DiCo), gli altri dalla riga di estrazione corrente.
export function extractionFacts(doc: DocRow): string[] {
  const facts: string[] = []
  const installer = doc.doc_type === 'dich_conformita_dm37' ? doc.extracted_metadata?.ragione_sociale_installatore : null
  if (installer) facts.push(`Installatore: ${installer}`)

  const ext = currentExtraction(doc)
  if (!ext) return facts

  if (ext.ambito) {
    facts.push(ext.ambito === 'unita' && ext.unita_riferimento
      ? `${AMBITO_LABELS.unita}: ${ext.unita_riferimento}`
      : AMBITO_LABELS[ext.ambito])
  } else if (ext.unita_riferimento) {
    facts.push(`Unità: ${ext.unita_riferimento}`)
  }

  if (isTypedDocType(doc.doc_type)) {
    switch (doc.doc_type) {
      case 'garanzia': {
        const f = ext.fields as Partial<GaranziaFields>
        if (f.oggetto) facts.push(f.oggetto)
        if (f.rilasciata_da) facts.push(`Rilasciata da ${f.rilasciata_da}`)
        break
      }
      case 'ape': {
        const f = ext.fields as Partial<ApeFields>
        if (f.classe_energetica) facts.push(`Classe ${f.classe_energetica}`)
        break
      }
      case 'polizza_decennale': {
        const f = ext.fields as Partial<PolizzaFields>
        if (f.compagnia) facts.push(f.compagnia)
        if (f.numero_polizza) facts.push(`Polizza n. ${f.numero_polizza}`)
        break
      }
    }
  }

  if (ext.valid_until) {
    facts.push(`Valida fino al ${formatDateIT(ext.valid_until)}`)
  } else {
    const formula = validityFormula(doc.doc_type, ext.fields)
    if (formula) facts.push(`Validità: ${formula}`)
  }
  return facts
}

// Riga secondaria del blocco Scadenze: l'OGGETTO della validità, non il
// tipo (che il titolo già dice quasi sempre): oggetto coperto per la
// garanzia, compagnia per la polizza, unità di riferimento altrimenti;
// il tipo documento solo se non c'è nulla di estratto da mostrare.
export function validitySubject(doc: DocRow): string | null {
  const ext = currentExtraction(doc)
  if (ext && isTypedDocType(doc.doc_type)) {
    if (doc.doc_type === 'garanzia') {
      const f = ext.fields as Partial<GaranziaFields>
      if (f.oggetto) return f.oggetto
    }
    if (doc.doc_type === 'polizza_decennale') {
      const f = ext.fields as Partial<PolizzaFields>
      if (f.compagnia) return f.compagnia
    }
  }
  if (ext?.unita_riferimento) return `Unità: ${ext.unita_riferimento}`
  return doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] : null
}
