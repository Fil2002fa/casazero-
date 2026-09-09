/**
 * Valida la destinazione post-login presa dalla query string.
 *
 * Fonte di verità unica per le tre superfici che maneggiano `next`: il
 * middleware che lo produce, il form di login che lo inoltra a Supabase e la
 * callback che lo consuma. Il valore arriva dall'esterno e finisce in un
 * redirect: senza questo filtro sarebbe un open redirect.
 *
 * Accetta SOLO un path interno assoluto. Ogni altra forma torna null e il
 * chiamante ricade sulla home del ruolo.
 *
 * Respinti in particolare:
 *  - URL assoluti e schemi (`https://evil.com`, `javascript:...`): non iniziano con '/'
 *  - protocol-relative (`//evil.com`): il browser li risolve come host esterno
 *  - `/\evil.com` e la sua forma percent-encoded `/%5Cevil.com`: diversi browser
 *    normalizzano il backslash in slash, rendendoli equivalenti al caso sopra
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (raw.startsWith('/\\')) return null
  if (raw.toLowerCase().startsWith('/%5c')) return null
  return raw
}
