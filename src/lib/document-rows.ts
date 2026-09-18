/**
 * Riga documento come la legge la pagina Documenti di residenza, con le
 * funzioni pure che ne ricavano i valori mostrati (estrazione corrente,
 * data in riga, fatti estratti, oggetto della validità). Spostate qui da
 * DocumentiClient.tsx senza modifiche perché la stessa riga alimenta due
 * superfici — lo schermo e l'export Excel (api/documenti-xlsx) — e un
 * modulo 'use client' non può essere importato da una route.
 * Fonte unica: nessuna superficie ricalcola questi valori inline.
 *
 * Import relativi tra moduli di lib (come document-extraction.ts): lo
 * script di verifica li carica con strip-types, che non risolve '@/'.
 */
import type { DocumentCategory } from '@/types/database'
import { formatDateIT } from './formatDate'
import {
  DOC_TYPE_LABELS,
  type DocType,
  type Sistema,
  type ClassificationStatus,
} from './document-classification'
import {
  AMBITO_LABELS,
  isTypedDocType,
  extractionIsCurrent,
  validityFormula,
  type DocumentExtractionRow,
  type GaranziaFields,
  type ApeFields,
  type PolizzaFields,
} from './document-extraction'

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

// Valori estratti di un documento, un campo per dato, già filtrati sul
// doc_type corrente: un campo è null se il documento non è di quel tipo,
// se l'estrazione manca o non è attuale, o se il documento non lo riporta.
// Fonte unica per la riga a schermo (extractionFacts), il blocco Scadenze
// (validitySubject) e l'export Excel (document-export.ts): nessuna
// superficie rilegge fields o extracted_metadata per conto suo.
export type DocumentFacts = {
  installatore: string | null      // verbale di classificazione, solo DiCo
  partitaIva: string | null        // idem, già a sole cifre: resta testo
  ambito: string | null            // etichetta pronta ("Parti comuni", "Unità: interno 3")
  unitaRiferimento: string | null  // testo informativo, mai una FK
  oggetto: string | null           // garanzia
  rilasciataDa: string | null      // garanzia
  classeEnergetica: string | null  // APE
  compagnia: string | null         // polizza decennale
  numeroPolizza: string | null     // polizza decennale
  validUntil: string | null        // ISO, calcolata all'estrazione
  validityFormula: string | null   // solo quando validUntil è null
}

// Le stringhe estratte arrivano già ripulite (extract-document, cleanString:
// trim, vuota → null); qui si legge in difesa, come per tutto il JSONB.
function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function documentFacts(doc: DocRow): DocumentFacts {
  const isDico = doc.doc_type === 'dich_conformita_dm37'
  const facts: DocumentFacts = {
    installatore: isDico ? nonEmpty(doc.extracted_metadata?.ragione_sociale_installatore) : null,
    partitaIva: isDico ? nonEmpty(doc.extracted_metadata?.partita_iva_installatore) : null,
    ambito: null,
    unitaRiferimento: null,
    oggetto: null,
    rilasciataDa: null,
    classeEnergetica: null,
    compagnia: null,
    numeroPolizza: null,
    validUntil: null,
    validityFormula: null,
  }

  const ext = currentExtraction(doc)
  if (!ext) return facts

  facts.unitaRiferimento = nonEmpty(ext.unita_riferimento)
  if (ext.ambito) {
    facts.ambito = ext.ambito === 'unita' && facts.unitaRiferimento
      ? `${AMBITO_LABELS.unita}: ${facts.unitaRiferimento}`
      : AMBITO_LABELS[ext.ambito]
  } else if (facts.unitaRiferimento) {
    facts.ambito = `Unità: ${facts.unitaRiferimento}`
  }

  if (isTypedDocType(doc.doc_type)) {
    switch (doc.doc_type) {
      case 'garanzia': {
        const f = ext.fields as Partial<GaranziaFields>
        facts.oggetto = nonEmpty(f.oggetto)
        facts.rilasciataDa = nonEmpty(f.rilasciata_da)
        break
      }
      case 'ape': {
        const f = ext.fields as Partial<ApeFields>
        facts.classeEnergetica = nonEmpty(f.classe_energetica)
        break
      }
      case 'polizza_decennale': {
        const f = ext.fields as Partial<PolizzaFields>
        facts.compagnia = nonEmpty(f.compagnia)
        facts.numeroPolizza = nonEmpty(f.numero_polizza)
        break
      }
    }
  }

  facts.validUntil = nonEmpty(ext.valid_until)
  facts.validityFormula = facts.validUntil ? null : validityFormula(doc.doc_type, ext.fields)
  return facts
}

// Fatti estratti da mostrare in riga, come brevi voci separate da " · ".
// Solo ciò che esiste: nessuna voce vuota, nessuna etichetta senza valore.
// Ordine: installatore, ambito, campi del tipo, validità. I campi di un
// tipo sono null per gli altri tipi, quindi l'elenco piatto rispetta
// l'ordine per tipo.
export function extractionFacts(doc: DocRow): string[] {
  const f = documentFacts(doc)
  const facts: string[] = []
  if (f.installatore) facts.push(`Installatore: ${f.installatore}`)
  if (f.ambito) facts.push(f.ambito)
  if (f.oggetto) facts.push(f.oggetto)
  if (f.rilasciataDa) facts.push(`Rilasciata da ${f.rilasciataDa}`)
  if (f.classeEnergetica) facts.push(`Classe ${f.classeEnergetica}`)
  if (f.compagnia) facts.push(f.compagnia)
  if (f.numeroPolizza) facts.push(`Polizza n. ${f.numeroPolizza}`)
  if (f.validUntil) {
    facts.push(`Valida fino al ${formatDateIT(f.validUntil)}`)
  } else if (f.validityFormula) {
    facts.push(`Validità: ${f.validityFormula}`)
  }
  return facts
}

// Riga secondaria del blocco Scadenze: l'OGGETTO della validità, non il
// tipo (che il titolo già dice quasi sempre): oggetto coperto per la
// garanzia, compagnia per la polizza, unità di riferimento altrimenti;
// il tipo documento solo se non c'è nulla di estratto da mostrare.
export function validitySubject(doc: DocRow): string | null {
  const f = documentFacts(doc)
  if (f.oggetto) return f.oggetto
  if (f.compagnia) return f.compagnia
  if (f.unitaRiferimento) return `Unità: ${f.unitaRiferimento}`
  return doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] : null
}
