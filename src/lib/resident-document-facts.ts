/**
 * Dati estratti che il residente vede sotto il titolo di un documento nella
 * PWA. Selezione decisa da Filippo il 18/09: validità o scadenza, classe
 * energetica, oggetto coperto, chi ha rilasciato la garanzia, nome
 * dell'installatore. MAI partita IVA, numero di polizza, ambito; nemmeno la
 * compagnia, che non è nell'elenco.
 *
 * I valori vengono tutti da documentFacts (document-rows.ts), fonte unica
 * dei dati estratti: qui si sceglie solo quali mostrare. Etichette e ordine
 * sono quelli di extractionFacts, che non si riusa così com'è perché include
 * ambito, compagnia e numero di polizza.
 *
 * Import relativi: il modulo si verifica con strip-types, che non risolve
 * '@/' (vedi scripts/ts-resolve-hooks.mjs).
 */
import { documentFacts, type DocRow } from './document-rows'
import { formatDateIT } from './formatDate'

export function residentDocumentFacts(doc: DocRow): string[] {
  const f = documentFacts(doc)
  const facts: string[] = []
  if (f.installatore) facts.push(`Installatore: ${f.installatore}`)
  if (f.oggetto) facts.push(f.oggetto)
  if (f.rilasciataDa) facts.push(`Rilasciata da ${f.rilasciataDa}`)
  if (f.classeEnergetica) facts.push(`Classe ${f.classeEnergetica}`)
  if (f.validUntil) {
    facts.push(`Valida fino al ${formatDateIT(f.validUntil)}`)
  } else if (f.validityFormula) {
    facts.push(`Validità: ${f.validityFormula}`)
  }
  return facts
}
