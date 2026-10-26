// ============================================================
// CasaZero — piano di ricalcolo delle scadenze su cambio della data di
// consegna di un'unita.
// ------------------------------------------------------------
// Funzione PURA: nessun import da Supabase, nessuna lettura, nessuna
// scrittura. Riceve le voci gia lette e dice, voce per voce, cosa succederebbe.
// La stessa uscita alimenta l'anteprima della modale "Registra consegna" e la
// scrittura: cio che l'utente conferma e esattamente cio che viene scritto.
//
// NESSUNA ARITMETICA NUOVA: la base la decide resolveDueBasis, la scadenza
// nextDueFrom (src/lib/maintenance-due.ts). Qui si decide solo QUALI voci
// toccare.
//
// REGOLE (decisione Filippo del 26/10):
//   - voce fuori piano (activation_status diverso da 'inclusa')  -> salta
//   - voce promemoria                                            -> salta
//   - voce con almeno un completamento                           -> salta
//     (il fascicolo vince sul modello: dal primo completamento la data la
//     riscrive czero_recalc_due da completed_at, 003_m2.sql:22-27)
//   - ogni altra voce                                            -> ricalcola
// Con la data dell'unita null (consegna rimossa) le voci ricalcolabili tornano
// a null: il cancello di resolveDueBasis si richiude. L'override di voce lo
// apre anche cosi, perche resolveDueBasis lo mette sopra il cancello.
//
// PRECEDENZA DEI MOTIVI DI SALTO: fuori_piano > promemoria > nel_fascicolo.
// Una voce ha un solo motivo, cosi i conteggi del riepilogo sommano al numero
// di voci saltate. Si dice prima cio che e piu strutturale: una voce
// archiviata con un completamento e "fuori piano" prima che "nel fascicolo".
// Promemoria e voci fuori piano restano nell'uscita (esito 'salta') ma
// l'anteprima non le mostra: e il chiamante a filtrarle.
// ============================================================

import type { CompletionMode, ItemActivation } from '@/types/database'
import { nextDueFrom, resolveDueBasis, type DueBasisLevel } from './maintenance-due'

export type DeliveryRecalcItem = {
  id: string
  /** Frequenza EFFETTIVA (voce ?? template, resolveFrequencyMonths). */
  frequencyMonths: number | null
  /** completion_mode EFFETTIVO (voce ?? template, resolveCompletionMode). */
  completionMode: CompletionMode | null
  activationStatus: ItemActivation
  /** maintenance_items.due_basis_override: SOLO l'override manuale. */
  dueBasisOverride: string | null
  /** maintenance_templates.category, per il livello categoria. */
  category: string
  hasCompletions: boolean
}

export type DeliveryRecalcInput = {
  /** Nuova units.delivery_date; null = consegna rimossa. */
  unitDeliveryDate: string | null
  /** Voci dell'unita (scope unita, mai parti comuni). */
  items: readonly DeliveryRecalcItem[]
  /** residence_category_dates della residenza. */
  categoryDates: readonly { category: string; deliveryDate: string }[]
  /** Oggi, ISO 'YYYY-MM-DD': parametro, non Date.now(), per restare pura. */
  today: string
}

export type DeliveryRecalcSkipReason = 'nel_fascicolo' | 'promemoria' | 'fuori_piano'

export type DeliveryRecalcRow =
  | {
      item_id: string
      esito: 'ricalcola'
      /** null = cancello chiuso: la voce torna senza scadenza. */
      nuova_data: string | null
      livello_base: DueBasisLevel | null
      motivo: null
    }
  | {
      item_id: string
      esito: 'salta'
      nuova_data: null
      livello_base: null
      motivo: DeliveryRecalcSkipReason
    }

export type DeliveryRecalcSummary = {
  ricalcolate: number
  saltate: Record<DeliveryRecalcSkipReason, number>
  /** Ricalcolate con nuova_data < today: nascono gia scadute. */
  gia_scadute: number
}

export type DeliveryRecalcPlan = {
  voci: DeliveryRecalcRow[]
  riepilogo: DeliveryRecalcSummary
}

function skipReason(item: DeliveryRecalcItem): DeliveryRecalcSkipReason | null {
  if (item.activationStatus !== 'inclusa') return 'fuori_piano'
  if (item.completionMode === 'promemoria') return 'promemoria'
  if (item.hasCompletions) return 'nel_fascicolo'
  return null
}

export function planDeliveryRecalc(input: DeliveryRecalcInput): DeliveryRecalcPlan {
  // nextDueFrom(x, 0) e la validazione e normalizzazione della data gia
  // esistente (orario scartato, calendario controllato): niente parser nuovo.
  const today = nextDueFrom(input.today, 0)

  // Una categoria con due date sarebbero due verita: la UNIQUE della 042 lo
  // impedisce nel DB, qui si rifiuta un input che la violi.
  const categoryDates = new Map<string, string>()
  for (const { category, deliveryDate } of input.categoryDates) {
    if (categoryDates.has(category)) {
      throw new Error(`planDeliveryRecalc: categoria con due date: ${JSON.stringify(category)}`)
    }
    categoryDates.set(category, deliveryDate)
  }

  const voci: DeliveryRecalcRow[] = []
  const riepilogo: DeliveryRecalcSummary = {
    ricalcolate: 0,
    saltate: { nel_fascicolo: 0, promemoria: 0, fuori_piano: 0 },
    gia_scadute: 0,
  }

  for (const item of input.items) {
    const motivo = skipReason(item)
    if (motivo) {
      voci.push({ item_id: item.id, esito: 'salta', nuova_data: null, livello_base: null, motivo })
      riepilogo.saltate[motivo]++
      continue
    }

    const basis = resolveDueBasis({
      scope: 'unit',
      itemOverride: item.dueBasisOverride,
      categoryDate: categoryDates.get(item.category) ?? null,
      unitDate: input.unitDeliveryDate,
    })

    let nuova: string | null = null
    if (basis.date !== null) {
      try {
        // Frequenza null: nextDueFrom la rifiuta ("frequenza non intera"),
        // ed e voluto — una scadenza senza frequenza non e calcolabile.
        nuova = nextDueFrom(basis.date, item.frequencyMonths as number)
      } catch (err) {
        // Senza l'id, un errore su un lotto di voci non dice quale e corrotta.
        throw new Error(`planDeliveryRecalc: voce ${item.id}: ${(err as Error).message}`)
      }
    }

    voci.push({ item_id: item.id, esito: 'ricalcola', nuova_data: nuova, livello_base: basis.level, motivo: null })
    riepilogo.ricalcolate++
    if (nuova !== null && nuova < today) riepilogo.gia_scadute++
  }

  return { voci, riepilogo }
}
