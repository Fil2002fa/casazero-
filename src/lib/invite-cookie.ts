// Cookie che ricorda l'invito aperto su /welcome/<token>, per i casi in cui il
// login parte senza `?invite=` (app installata dalla pagina di benvenuto che si
// riapre su `/`, indirizzo digitato a mano). Il cookie NON autorizza nulla: e'
// solo un suggerimento di token. La validazione resta all'unico lookup di
// auth/callback (token esistente, non usato, non scaduto).
//
// Modulo puro, senza import di next/*: lo usano middleware (edge) e server.

export const INVITE_COOKIE = 'cz_invite'

// Forma reale dei token: invites.token = encode(gen_random_bytes(32), 'hex'),
// quindi 64 caratteri esadecimali minuscoli (106 inviti su 106 in DB).
const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/

// Due ore: il tempo di installare l'app e fare il primo accesso.
export const INVITE_COOKIE_MAX_AGE = 2 * 60 * 60

/** Il token se ha la forma attesa (dopo trim), altrimenti null. */
export function normalizeInviteToken(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const token = raw.trim()
  return INVITE_TOKEN_RE.test(token) ? token : null
}

/** Il token di un path `/welcome/<token>` (solo la landing, non /accept), o null. */
export function inviteTokenFromWelcomePath(pathname: string): string | null {
  const match = pathname.match(/^\/welcome\/([^/]+)\/?$/)
  if (!match) return null
  let raw = match[1]
  try { raw = decodeURIComponent(raw) } catch { /* non decodificabile: si usa com'e' */ }
  return normalizeInviteToken(raw)
}
