export interface EmailPayload {
  to: string
  subject: string
  html: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(`[DEV EMAIL → ${payload.to}] ${payload.subject}`)
    return
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: 'CasaZero <noreply@casazero.app>',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('[EMAIL ERROR]', err)
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
