import { formatFrequency } from './formatFrequency'
import type { UserRole } from '@/types/database'

export interface EmailPayload {
  to: string
  subject: string
  html: string
}

// Esito discriminato: 'simulated' è distinto da 'sent' — senza RESEND_API_KEY
// l'invio non è mai partito, solo loggato. I chiamanti esistenti (cron/daily,
// admin/manutenzioni/actions) ignorano il valore di ritorno: retrocompatibile,
// erano già in await su una Promise.
// `id` è il message id di Resend, disponibile solo nel ramo 'sent': gli altri
// due rami non hanno un messaggio a cui riferirsi. È `string | null`, mai
// stringa vuota o placeholder — un id finto in un registro immutabile sarebbe
// indistinguibile da uno vero.
export type EmailResult =
  | { status: 'sent'; id: string | null }
  | { status: 'simulated' }
  | { status: 'error'; message: string }

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  // IN PRODUZIONE RESEND_FROM VA IMPOSTATA, su un dominio verificato su Resend
  // (es. 'CasaZero <noreply@casazero.app>' con casazero.app verificato nel
  // pannello Resend). Se resta vuota il mittente è la sandbox
  // onboarding@resend.dev, che consegna SOLO all'indirizzo dell'account Resend:
  // verso qualsiasi destinatario reale Resend risponde 403 e l'email non parte.
  // La sandbox è il default perché è l'unico valore che funziona senza dominio
  // verificato — è il default giusto per lo sviluppo, mai per la produzione.
  //
  // `||` e non `??`, deviazione intenzionale dalla convenzione del repo: su
  // Vercel una variabile creata e lasciata vuota è un caso reale, e `??` non
  // intercetta la stringa vuota — produrrebbe `from: ''` e un errore Resend a
  // runtime invece del fallback.
  const from = process.env.RESEND_FROM || 'CasaZero <onboarding@resend.dev>'

  if (!apiKey) {
    console.log(`[DEV EMAIL → ${payload.to}] ${payload.subject}`)
    return { status: 'simulated' }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    })
    if (error) throw new Error(error.message)
    return { status: 'sent', id: data?.id || null }
  } catch (err) {
    console.error('[EMAIL ERROR]', err)
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

// ── Link alla voce ────────────────────────────────────────────

/**
 * Link diretto a una manutenzione, scelto dal RUOLO del destinatario e non
 * dalla modalità della voce: un membro di unità può essere un admin (account di
 * test), e la shell residente `(app)` rimanda ogni ruolo diverso da client alla
 * dashboard `/admin` perdendo il percorso ((app)/layout.tsx).
 *
 *   client               → /manutenzioni/<id>        (PWA residente)
 *   admin, super_admin   → /admin/manutenzioni/<id>  (dashboard)
 *   ruolo mancante       → /manutenzioni             (elenco: il link di prima,
 *                          che ogni shell sa già rimandare al posto giusto)
 *
 * Fonte unica: cron e sollecito manuale. Il ruolo da passare è quello
 * dell'ACCESSO alla voce (linkRoleForAccess), non il solo profiles.role: un
 * admin non assegnato alla residenza, o un super_admin di un altro builder,
 * non vede la voce (RLS) e il link diretto finirebbe su un 404. Per loro il
 * ruolo è null e il link porta all'elenco.
 */
export function maintenanceItemUrl(
  appUrl: string,
  role: UserRole | null | undefined,
  itemId: string,
): string {
  const id = encodeURIComponent(itemId)
  if (role === 'client') return `${appUrl}/manutenzioni/${id}`
  if (role === 'admin' || role === 'super_admin') return `${appUrl}/admin/manutenzioni/${id}`
  return `${appUrl}/manutenzioni`
}

/**
 * Ruolo con cui scegliere il link alla voce, dato l'accesso reale del
 * destinatario alla residenza della voce. Specchio della RLS di
 * maintenance_items (czero_can_access_residence / czero_can_access_unit):
 *
 *   client       → client (arriva da unit_members, la PWA gli mostra la voce)
 *   admin        → admin solo se assegnato alla residenza (admin_assignments)
 *   super_admin  → super_admin solo se il builder è quello della residenza
 *   altrimenti   → null (maintenanceItemUrl porta all'elenco, mai a un 404)
 */
export function linkRoleForAccess(
  role: UserRole,
  access: { assignedToResidence: boolean; sameBuilderAsResidence: boolean },
): UserRole | null {
  if (role === 'client') return 'client'
  if (role === 'admin') return access.assignedToResidence ? 'admin' : null
  if (role === 'super_admin') return access.sameBuilderAsResidence ? 'super_admin' : null
  return null
}

// ── Template email ────────────────────────────────────────────

function emailWrapper(content: string) {
  return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F3EF;font-family:system-ui,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E4E6E2;">
    <div style="background:#04342C;padding:24px 28px;">
      <span style="color:#fff;font-size:18px;font-weight:500;">CasaZero</span>
    </div>
    <div style="padding:28px;">${content}</div>
    <div style="padding:16px 28px;border-top:1px solid #E4E6E2;">
      <p style="margin:0;font-size:12px;color:#6B7A74;">Hai ricevuto questa email perché sei registrato su CasaZero.</p>
    </div>
  </div>
</body>
</html>`
}

// Scadenza di una voce residente o amministratore. Le promemoria hanno il loro
// template (emailPromemoriaDue): mai linguaggio di scadenza su quelle voci.
export function emailMaintenanceDue(title: string, mode: 'residente' | 'amministratore', dueDate: string, actionUrl: string) {
  const heading = mode === 'amministratore' ? 'Manutenzione condominiale in scadenza' : 'Manutenzione in scadenza'
  const color = mode === 'amministratore' ? '#854F0B' : '#A32D2D'
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">${heading}</h2>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      <strong style="color:${color};">${title}</strong> è scaduta il <strong>${dueDate}</strong>.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#04342C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Vai alle manutenzioni →
    </a>`)
}

// Promemoria: nessuna data, nessuna scadenza, solo la frequenza consigliata.
// Stesso testo e stesso blu del PromemoriaBadge (components/ui/Badge.tsx).
export function emailPromemoriaDue(title: string, frequencyMonths: number | null, actionUrl: string) {
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">Manutenzione consigliata</h2>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      <strong style="color:#185FA5;">${title}</strong> · Consigliata ${formatFrequency(frequencyMonths)}.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#04342C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Vai alle manutenzioni →
    </a>`)
}

export function emailMaintenanceReminder(title: string, dueDate: string, actionUrl: string) {
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">Promemoria manutenzione non eseguita</h2>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      <strong>${title}</strong> è scaduta il <strong>${dueDate}</strong> e non è ancora stata completata.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#04342C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Completa ora →
    </a>`)
}

export function emailN3StatusChanged(title: string, newStatus: string, residenceName: string, appUrl: string) {
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">Aggiornamento manutenzione condominiale</h2>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      La manutenzione <strong>${title}</strong> in <strong>${residenceName}</strong>
      è ora <strong>${newStatus}</strong>.
    </p>
    <a href="${appUrl}/manutenzioni"
       style="display:inline-block;background:#04342C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Visualizza dettagli →
    </a>`)
}

/**
 * Sollecito manuale, nomenclatura v2 (modalità / tipo).
 *
 * Template NUOVO, non una variante di emailMaintenanceReminder: quello è il
 * promemoria automatico del cron ("non ancora completata"), questo è un
 * sollecito nominativo inviato da una persona. I template N1/N2/N3 qui sopra
 * restano intoccati: la loro nomenclatura è debito già registrato, non è
 * questo commit.
 */
export function emailSollecito(args: {
  title: string
  obligationLabel: string | null
  residenceName: string
  unitLabel: string | null
  dueDate: string
  actionUrl: string
}) {
  const where = args.unitLabel
    ? `${args.residenceName} · ${args.unitLabel}`
    : `${args.residenceName} · Condominio`
  const tipo = args.obligationLabel
    ? `<span style="color:#6B7A74;"> · ${args.obligationLabel}</span>`
    : ''
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">Sollecito: manutenzione da eseguire</h2>
    <p style="margin:0 0 8px;color:#6B7A74;font-size:14px;line-height:1.5;">
      <strong style="color:#20302A;">${args.title}</strong>${tipo}
    </p>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      ${where} — scadenza del <strong>${args.dueDate}</strong>, non ancora eseguita.
    </p>
    <a href="${args.actionUrl}"
       style="display:inline-block;background:#04342C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Apri la manutenzione →
    </a>`)
}
