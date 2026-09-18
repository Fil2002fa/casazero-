/**
 * Unico formatter di data per i blocchi nuovi della pagina Documenti
 * (Da caricare, Scadenze, dati estratti in archivio). "12 set 2026".
 *
 * Deterministico per costruzione: nessun `toLocaleDateString`, che tra Node
 * (server) e Safari (client) produce testo diverso e un mismatch di
 * hydration — precedente documentato in (app)/documenti/page.tsx, che per
 * questo formatta sul server. Qui il risultato è identico ovunque, quindi
 * l'helper si può chiamare anche in un client component.
 *
 * Accetta la data ISO come la restituisce Postgres per una colonna DATE
 * ('YYYY-MM-DD') o un TIMESTAMPTZ ('YYYY-MM-DDTHH:mm:ss…'): legge solo i
 * primi 10 caratteri, nessuna conversione di fuso. Una DATE non ha fuso e
 * farla passare da `new Date()` la sposterebbe di un giorno a ovest di UTC.
 *
 * DEBITO ANNOTATO (18/09/2026, non assorbito per decisione esplicita): nel
 * repo restano 28 `toLocaleDateString` inline in 23 file, con lo stesso
 * formato day/month short/year in quasi tutti. Non sono stati toccati: sono
 * equivalenti, non sbagliati, e riscriverli è fuori dal perimetro del blocco
 * estrazione. Questa è la fonte unica per il codice NUOVO; ogni superficie
 * che verrà riscritta dovrebbe migrare qui invece di aggiungere la 29ª copia.
 * Elenco (file:occorrenze): (app)/documenti/page.tsx:1, (app)/fascicolo/
 * page.tsx:1, (app)/manutenzioni/CompletionSheet.tsx:1, (app)/manutenzioni/
 * [id]/page.tsx:2, (app)/page.tsx:1, (app)/profilo/ProfiloClient.tsx:1,
 * admin/administrators/[id]/page.tsx:1, admin/manutenzioni/[id]/page.tsx:2,
 * admin/manutenzioni/page.tsx:1, residences/[id]/documenti/
 * DocumentiClient.tsx:2, residences/[id]/fascicolo/page.tsx:1, residences/
 * [id]/manutenzioni/ManutenzioniClient.tsx:2, residences/[id]/manutenzioni/
 * actions.ts:1, residences/[id]/page.tsx:1, residences/[id]/units/
 * UnitsManager.tsx:1, api/fascicolo-pdf/route.ts:1, api/report/route.ts:1,
 * components/CommentsSection.tsx:1, components/MaintenanceCard.tsx:1,
 * lib/activity-feed.ts:2, lib/maintenance-status.ts:1, lib/pdf/
 * FascicoloDocument.tsx:1, lib/pdf/ReportDocument.tsx:1.
 */

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/**
 * '2026-09-12' → '12 set 2026'. Stringa vuota per null/undefined o per un
 * valore che non inizia con una data ISO valida: un dato assente si rende
 * come assenza, mai come "Invalid Date" o come una data inventata.
 */
export function formatDateIT(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${day} ${MESI_BREVI[month - 1]} ${year}`
}
