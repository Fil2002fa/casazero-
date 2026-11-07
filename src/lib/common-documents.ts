/**
 * Tab "Parti comuni" della pagina Documenti (E1b, commit 9): una riga per ogni
 * documento atteso della residenza non legato a un'unità, come funzioni pure.
 * Il componente non decide niente da solo, e scripts/verify-common-documents.mjs
 * prova ogni regola senza avviare l'app.
 *
 * La fonte è la checklist (computeResidenceChecklist, document-checklist.ts): qui
 * non si rifà nessun match e nessun conteggio di presenza. Si fa solo la
 * presentazione: che documento mostra la riga, quale ambito, quale contatore.
 * Una voce è "caricata" se la checklist la dà per soddisfatta, quindi valgono le
 * sue regole (solo classificazione completata, e per le voci di condominio e
 * dossier amministratore solo documenti senza unità).
 *
 * Il contatore è caricati/totale e il totale NON conta le voci non applicabili:
 * quelle stanno in `excluded`, fuori dalle righe e fuori dal totale.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import type { DocumentCategory } from '../types/database'
import type { ChecklistExpectation, ChecklistResult } from './document-checklist'
import { DOC_TYPE_TO_CATEGORY, type DocType } from './document-classification'
import type { DocRow } from './document-rows'

export type CommonDocumentRow = {
  /** expectationKey della checklist: chiave stabile della riga. */
  key: string
  label: string
  docType: DocType
  /** 'caricato' = la checklist la dà per soddisfatta; altrimenti 'mancante'. */
  state: 'caricato' | 'mancante'
  /**
   * Il documento che la riga apre: il più recente tra quelli che soddisfano la
   * voce. null se la voce è mancante. Può essere null anche su 'caricato' solo
   * se la checklist e la lista documenti sono state lette a istanti diversi e
   * il documento non c'è più: la riga allora non apre niente.
   */
  doc: DocRow | null
  /**
   * Categoria da precaricare nel caricamento, da DOC_TYPE_TO_CATEGORY. null se
   * il tipo non è mappato: in quel caso la categoria NON si precarica, nessun
   * valore indovinato.
   */
  category: DocumentCategory | null
  /** Ambito da mostrare accanto al nome, solo dove differisce da "Parti comuni". */
  scopeLabel: string | null
  /** La voce della checklist com'è, per le azioni che la riguardano (Non applicabile). */
  expectation: ChecklistExpectation
}

export type CommonDocuments = {
  /** Voci applicabili, nell'ordine della checklist (ambito, poi sort_order). */
  rows: CommonDocumentRow[]
  /** Voci non applicabili, nell'ordine della checklist: in coda al tab. */
  excluded: ChecklistExpectation[]
  loaded: number
  total: number
  warnings: string[]
}

/**
 * Etichetta d'ambito di una voce. "Parti comuni" è l'ambito di default del tab
 * (condominium) e non si ripete: tutte le altre righe lo sono per definizione.
 */
export function commonScopeLabel(scope: ChecklistExpectation['scope']): string | null {
  switch (scope) {
    case 'condominium': return null
    case 'dossier_admin': return 'Dossier amministratore'
    case 'residence': return 'Residenza'
    default: return scope
  }
}

/** Il documento più recente tra quelli che soddisfano la voce; a parità vale l'ordine ricevuto. */
function latestMatchingDoc(exp: ChecklistExpectation, docsById: ReadonlyMap<string, DocRow>): DocRow | null {
  const found = exp.matchingDocuments
    .map(m => docsById.get(m.id))
    .filter((d): d is DocRow => d !== undefined)
  if (found.length === 0) return null
  return [...found].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
}

/**
 * Le righe, le escluse e il contatore del tab. null se la checklist non è
 * disponibile: un guasto di lettura non è mai "niente da caricare", e il
 * componente mostra lo stato non disponibile con Riprova.
 */
export function commonDocuments(checklist: ChecklistResult, docs: readonly DocRow[]): CommonDocuments | null {
  if (!checklist.available) return null
  const docsById = new Map(docs.map(d => [d.id, d]))

  const rows: CommonDocumentRow[] = []
  const excluded: ChecklistExpectation[] = []
  for (const exp of checklist.expectations) {
    if (exp.scope === 'unit') continue // non usato in v1, come in ScopeCounts
    if (exp.notApplicable) {
      excluded.push(exp)
      continue
    }
    rows.push({
      key: exp.expectationKey,
      label: exp.label,
      docType: exp.docType,
      state: exp.satisfied ? 'caricato' : 'mancante',
      doc: exp.satisfied ? latestMatchingDoc(exp, docsById) : null,
      category: DOC_TYPE_TO_CATEGORY[exp.docType] ?? null,
      scopeLabel: commonScopeLabel(exp.scope),
      expectation: exp,
    })
  }

  return {
    rows,
    excluded,
    loaded: rows.filter(r => r.state === 'caricato').length,
    total: rows.length,
    warnings: checklist.warnings,
  }
}

/**
 * Testo del badge del tab: "caricati/totale", sempre visibile se il totale è
 * maggiore di zero (anche 0/N). null se la checklist non è disponibile o non c'è
 * nessuna voce applicabile. Stile neutro, mai ambra: una voce mancante non è un
 * avviso.
 */
export function commonBadge(result: CommonDocuments | null): string | null {
  if (result === null || result.total === 0) return null
  return `${result.loaded}/${result.total}`
}
