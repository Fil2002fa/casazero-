/**
 * Un embed to-one di PostgREST (relazione N:1 dedotta dalla foreign key) può
 * tornare l'oggetto o un array di un elemento, a seconda di come il client
 * deduce la relazione — con un client non tipizzato (nessun generic
 * Database) il compilatore non discrimina il caso. Assumere solo l'oggetto
 * dà un valore mancante in silenzio quando PostgREST torna un array: nessun
 * errore, solo un dato sbagliato a valle (bug class registrata in CLAUDE.md).
 *
 * Terza occorrenza di questa identica normalizzazione nel repo
 * (residences/[id]/attivita/page.tsx:31-38, admin/fornitori/page.tsx:16-23,
 * scritte prima di questo helper) — questa è la fonte unica per il codice
 * nuovo. Le due precedenti non sono state toccate: sono equivalenti, non
 * sbagliate, e riscriverle non è nel perimetro di questo commit.
 *
 * Non valida i campi dell'oggetto — la forma cambia da query a query, quella
 * verifica resta al chiamante (`typeof supplier.name === 'string'`, ecc.).
 */
export function normalizeEmbed<T extends object>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value
  return (row !== null && typeof row === 'object') ? (row as T) : null
}
