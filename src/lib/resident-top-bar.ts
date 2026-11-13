/**
 * Regole pure della barra in alto del residente: dove si vede e che cosa dice
 * sotto "CasaZero". Il componente non decide niente da solo, e
 * scripts/verify-resident-top-bar.mjs prova ogni regola senza avviare l'app.
 *
 * Testi degli stati degradati: gli stessi della lista manutenzioni
 * (manutenzioni/page.tsx), così le due barre dicono la stessa cosa.
 */

// Solo queste route, a percorso esatto. Manutenzioni, fascicolo e profilo montano
// la loro barra nella pagina (MaintenanceHeader); la guida e
// /profilo/dati-personali hanno un header proprio. Una barra sola per route.
const TOP_BAR_PATHS = new Set(['/', '/documenti'])

export function showsResidentTopBar(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return TOP_BAR_PATHS.has(normalized)
}

export type TopBarSubtitleInput =
  | { state: 'ok'; residenceName: string | null; unitLabel: string }
  | { state: 'no-unit' }
  | { state: 'error' }

export const TOP_BAR_ERROR_TEXT = 'Residenza non disponibile'
export const TOP_BAR_NO_UNIT_TEXT = 'Nessuna unità associata'
export const TOP_BAR_FALLBACK_RESIDENCE = 'La tua residenza'

export function topBarSubtitle(input: TopBarSubtitleInput): string {
  if (input.state === 'error') return TOP_BAR_ERROR_TEXT
  if (input.state === 'no-unit') return TOP_BAR_NO_UNIT_TEXT
  const residence = input.residenceName?.trim() || TOP_BAR_FALLBACK_RESIDENCE
  return [residence, input.unitLabel.trim()].filter(Boolean).join(' · ')
}
