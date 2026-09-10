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

export function emailMaintenanceDue(title: string, priority: 'N1' | 'N2' | 'N3', dueDate: string, appUrl: string) {
  const label = priority === 'N1' ? 'consigliata' : priority === 'N2' ? 'obbligatoria' : 'condominiale'
  const color = priority === 'N2' ? '#A32D2D' : priority === 'N3' ? '#854F0B' : '#185FA5'
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">Manutenzione ${label} in scadenza</h2>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      <strong style="color:${color};">${title}</strong> è scaduta il <strong>${dueDate}</strong>.
    </p>
    <a href="${appUrl}/manutenzioni"
       style="display:inline-block;background:#04342C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Vai alle manutenzioni →
    </a>`)
}

export function emailMaintenanceReminder(title: string, priority: 'N2' | 'N3', dueDate: string, appUrl: string) {
  return emailWrapper(`
    <h2 style="margin:0 0 12px;color:#20302A;font-size:16px;">Promemoria manutenzione non eseguita</h2>
    <p style="margin:0 0 20px;color:#6B7A74;font-size:14px;line-height:1.5;">
      <strong>${title}</strong> è scaduta il <strong>${dueDate}</strong> e non è ancora stata completata.
    </p>
    <a href="${appUrl}/manutenzioni"
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
