import {
  Send, Mail, UserCheck, UserPlus, UserMinus, FileText, FileCheck, Archive,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityEvent, ActivityEventType } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'

/**
 * Resa a schermo di una riga di `activity_events`. Gemello di lettura di
 * `activity-log.ts`, che è la scrittura; `activity-feed.ts` resta generico e
 * non conosce il registro.
 *
 * REGOLA FONDANTE: la frase si costruisce QUI, a lettura, dal payload
 * strutturato. Il registro è append-only, quindi nel DB non finisce mai testo
 * già formattato per lo schermo: cambiare una parola deve costare un deploy,
 * non una riscrittura di righe immutabili.
 */

/**
 * Tipizzata `Record<ActivityEventType, ...>`: la completezza sugli 8 tipi la
 * impone il compilatore, non la diligenza. Non ha nulla a che vedere con la
 * mappa della pagina demo di portafoglio, che serve i suoi tipi finti — i due
 * insiemi sono disgiunti.
 */
export const ACTIVITY_EVENT_ICON: Record<ActivityEventType, LucideIcon> = {
  sollecito_inviato:      Send,
  invito_inviato:         Mail,
  invito_accettato:       UserCheck,
  admin_assegnato:        UserPlus,
  admin_rimosso:          UserMinus,
  documento_caricato:     FileText,
  documento_classificato: FileCheck,
  voce_archiviata:        Archive,
}

/**
 * Etichette neutre, senza interpolazione dal payload.
 *
 * Oggi solo `sollecito_inviato` ha un produttore: nessuna riga degli altri 7
 * tipi può esistere. Scrivere ora una frase ricca per quei tipi significherebbe
 * scrivere testo che nessuno può provare, contro un payload che non è ancora
 * stato deciso. La frase piena arriva col suo produttore.
 */
const NEUTRAL_LABEL: Record<ActivityEventType, string> = {
  sollecito_inviato:      'Sollecito inviato',
  invito_inviato:         'Invito inviato',
  invito_accettato:       'Invito accettato',
  admin_assegnato:        'Amministratore assegnato',
  admin_rimosso:          'Amministratore rimosso',
  documento_caricato:     'Documento caricato',
  documento_classificato: 'Documento classificato',
  voce_archiviata:        'Voce archiviata',
}

// Il payload è JSONB non vincolato dal DB: ogni chiave va letta in modo
// difensivo. Una riga vecchia con una chiave mancante non deve rompere la
// pagina, e la tabella è immutabile: quelle righe non si possono correggere.
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Soggetto della riga. Si decide su `unit_id`, la colonna top-level, MAI
 * sull'embed `units(label)`: se l'embed torna vuoto perché RLS lo nasconde, un
 * evento di unità verrebbe reso come condominiale, cioè una riga del registro
 * mostrata falsa. Le tre condizioni sono distinte apposta.
 */
export function activityEventSubject(unitId: string | null, unitLabel: string | null): string {
  if (unitId === null) return 'Condominiale'
  if (unitLabel === null) return 'Unità sconosciuta'
  return `Unità ${formatUnitLabel(unitLabel)}`
}

/**
 * Evento → frase. Fonte unica: una modifica al testo si fa qui e vale su ogni
 * superficie che rende il registro.
 */
export function describeActivityEvent(event: ActivityEvent): string {
  if (event.event_type === 'sollecito_inviato') {
    const title = asString(event.payload.title)
    const sent = asNumber(event.payload.sent)
    const daysLate = asNumber(event.payload.days_late)

    // `sent` è il numero di destinatari realmente raggiunti: la riga esiste
    // solo se era > 0 (actions.ts:226-232), ma il payload resta non vincolato.
    const details: string[] = []
    if (sent !== null) details.push(pluralize(sent, 'destinatario', 'destinatari'))
    if (daysLate !== null && daysLate > 0) details.push(`${pluralize(daysLate, 'giorno', 'giorni')} di ritardo`)

    const head = title ? `Sollecito inviato per «${title}»` : NEUTRAL_LABEL.sollecito_inviato
    return details.length > 0 ? `${head} (${details.join(', ')})` : head
  }

  return NEUTRAL_LABEL[event.event_type]
}
