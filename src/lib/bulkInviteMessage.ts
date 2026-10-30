import { pluralize } from './pluralize'

// Esito di createBulkInvites in una frase. Una sola fonte per le due superfici
// che generano inviti in blocco: la riga «Invita tutte» della pagina Unità e
// la consegna multipla.
export function bulkInviteMessage(r: { count: number; skipped: number; notDelivered: number }): string {
  const head = r.count > 0 ? `Inviti generati per ${r.count} unità` : 'Nessun nuovo invito generato'
  const notes: string[] = []
  if (r.notDelivered > 0) {
    notes.push(`${pluralize(r.notDelivered, 'unità saltata', 'unità saltate')} perché non ${r.notDelivered === 1 ? 'consegnata' : 'consegnate'}`)
  }
  const other = r.skipped - r.notDelivered
  if (other > 0) {
    notes.push(`${pluralize(other, 'unità saltata', 'unità saltate')} perché ${other === 1 ? 'ha' : 'hanno'} già un account o un invito attivo`)
  }
  return notes.length > 0 ? `${head}; ${notes.join('; ')}.` : `${head}.`
}
