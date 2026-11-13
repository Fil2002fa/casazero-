// Saluto della home residente. Regole pure, senza React e senza query: la home
// le chiama, scripts/verify-greeting.mjs le verifica (npm run verify:saluto).
//
// NOME. Si parte da profiles.full_name, che per chi non entra con Google il
// trigger handle_new_user riempie con la parte locale dell'email (001_schema.sql).
// Quel valore non è un nome: se, normalizzato (trim + minuscolo), coincide con la
// parte locale dell'email, il nome non c'è. Altrimenti si usa solo il primo nome.
// Mai ricavato dall'email.
//
// ORA. Si legge in Europe/Rome, non nel fuso del server: Buongiorno 5-12,
// Ciao 13-17, Buonasera 18-4 (le ore intere, 12:59 è ancora Buongiorno).

export type GreetingWord = 'Buongiorno' | 'Ciao' | 'Buonasera'

export function romeHour(now: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Rome',
  }).formatToParts(now).find(p => p.type === 'hour')?.value
  return Number(h)
}

export function greetingWord(now: Date): GreetingWord {
  const h = romeHour(now)
  if (h >= 5 && h <= 12) return 'Buongiorno'
  if (h >= 13 && h <= 17) return 'Ciao'
  return 'Buonasera'
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** Primo nome da mostrare, oppure null se non c'è un nome utilizzabile. */
export function residentFirstName(fullName: string | null | undefined, email: string | null | undefined): string | null {
  const full = norm(fullName ?? '')
  if (!full) return null
  const local = norm((email ?? '').split('@')[0] ?? '')
  // Anche senza il +tag degli alias (pippoloro02+residente → pippoloro02).
  if (local && (full === local || full === local.split('+')[0])) return null
  return (fullName ?? '').trim().split(/\s+/)[0] || null
}

/** `name` null = saluto senza nome: la UI scrive "Buongiorno" + punto. */
export function buildGreeting(
  fullName: string | null | undefined,
  email: string | null | undefined,
  now: Date,
): { word: GreetingWord; name: string | null } {
  return { word: greetingWord(now), name: residentFirstName(fullName, email) }
}
