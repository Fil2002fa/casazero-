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
  // Il tipo nel CHECK resta `invito_inviato`, ma l'atto registrato è la
  // GENERAZIONE del link: nessuna email parte dai produttori (units/actions.ts,
  // admin-actions.ts). Il testo non deve promettere un invio che non c'è.
  invito_inviato:         'Invito generato',
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

  if (event.event_type === 'voce_archiviata') {
    const title = asString(event.payload.title)
    const count = asNumber(event.payload.count)

    // `count` è il numero di istanze archiviate nell'atto: la riga esiste solo
    // se era > 0 (fornitori/actions.ts), ma il payload resta non vincolato.
    const head = title ? `Voce «${title}» archiviata` : NEUTRAL_LABEL.voce_archiviata
    return count !== null ? `${head} (${pluralize(count, 'istanza', 'istanze')})` : head
  }

  if (event.event_type === 'admin_assegnato') {
    const name = asString(event.payload.assigned_name)
    const replaced = asString(event.payload.replaced_name)
    const head = name ? `Amministratore ${name} assegnato` : NEUTRAL_LABEL.admin_assegnato
    // `replaced_name` è valorizzato solo quando l'upsert ha sostituito un
    // admin precedente (admin-actions.ts): senza, l'atto è una prima nomina.
    return replaced ? `${head} al posto di ${replaced}` : head
  }

  if (event.event_type === 'admin_rimosso') {
    const name = asString(event.payload.removed_name)
    return name ? `Amministratore ${name} rimosso` : NEUTRAL_LABEL.admin_rimosso
  }

  if (event.event_type === 'invito_inviato') {
    const role = asString(event.payload.role)
    const count = asNumber(event.payload.count)

    // Tre produttori, tre forme: il singolo per unità (count 1, il soggetto
    // "Unità X" lo dà già activityEventSubject), il massivo (una riga per
    // atto, count > 1, condominiale) e l'invito amministratore (role admin).
    // Sempre "generato", mai "inviato": nessuna email parte da questi atti.
    if (role === 'admin') return 'Invito amministratore generato'
    if (count !== null && count > 1) return pluralize(count, 'invito generato', 'inviti generati')
    return NEUTRAL_LABEL.invito_inviato
  }

  if (event.event_type === 'invito_accettato') {
    // `role_acquired` è il ruolo scritto su profiles all'accettazione
    // (accept-invite.ts). Chi ha accettato è l'attore della riga, non il
    // payload: il nome lo rende la colonna attore, qui solo l'atto.
    const role = asString(event.payload.role_acquired)
    return role === 'admin' ? 'Invito amministratore accettato' : NEUTRAL_LABEL.invito_accettato
  }

  return NEUTRAL_LABEL[event.event_type]
}
