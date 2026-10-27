import type { DeliveryRecalcSummary } from '@/lib/delivery-recalc'
import { pluralize } from '@/lib/pluralize'

// Avvisi dell'anteprima di consegna ("già scadute", "nel fascicolo"): fonte
// unica per la modale singola e per quella multipla. Non rende nulla se il
// riepilogo non ha niente da segnalare.
export function DeliveryPreviewWarnings({ riepilogo }: { riepilogo: DeliveryRecalcSummary }) {
  const nelFascicolo = riepilogo.saltate.nel_fascicolo
  return (
    <>
      {riepilogo.gia_scadute > 0 && (
        <p className="rounded-lg bg-semantic-amber-bg px-3 py-2 text-semantic-amber">
          {pluralize(riepilogo.gia_scadute, 'voce nasce', 'voci nascono')} già{' '}
          {riepilogo.gia_scadute === 1 ? 'scaduta' : 'scadute'}: la nuova scadenza è precedente a oggi.
        </p>
      )}
      {nelFascicolo > 0 && (
        <p className="rounded-lg bg-semantic-amber-bg px-3 py-2 text-semantic-amber">
          {pluralize(nelFascicolo, 'voce resta invariata', 'voci restano invariate')}:{' '}
          {nelFascicolo === 1 ? 'ha' : 'hanno'} già interventi registrati nel
          fascicolo, quindi la scadenza non dipende dalla consegna.
        </p>
      )}
    </>
  )
}
