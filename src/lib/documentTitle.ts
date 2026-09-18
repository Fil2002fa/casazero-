/**
 * Titolo leggibile di un documento, per ogni superficie che lo mostra
 * (archivio, Scadenze): un solo helper, mai una normalizzazione inline.
 *
 * documents.title nasce dal nome del file senza estensione (upload), quindi
 * spesso è "certificato_garanzia_caldaia" o "DiCo_impianto_VMC_ClimaNordest".
 * Regola minima e reversibile a occhio: underscore → spazio, spazi
 * multipli collassati, prima lettera maiuscola. Il resto della stringa non
 * viene toccato: "DiCo", "VMC", sigle e maiuscole interne restano come sono,
 * perché abbassarle inventerebbe una forma che l'utente non ha scritto.
 * Un titolo già con spazi passa quasi invariato (solo la prima maiuscola).
 */
export function humanizeDocumentTitle(title: string | null | undefined): string {
  if (!title) return ''
  const spaced = title.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  if (spaced === '') return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
