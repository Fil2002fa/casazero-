/**
 * Residenza e unità attiva del residente, per la barra in alto (ResidentTopBar).
 * Una sola lettura per richiesta (cache), col client di sessione: la policy
 * "unit_members: il membro legge i propri" limita già alle righe dell'utente.
 *
 * `error` non viene scartato: un fallimento tecnico è un esito distinto da
 * "nessuna unità associata" (bug class in CLAUDE.md). Con DUE membership attive
 * maybeSingle() fallisce: finisce nello stato 'error', come nelle pagine che
 * leggono la membership allo stesso modo.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { topBarSubtitle, type TopBarSubtitleInput } from '@/lib/resident-top-bar'

export const getResidentTopBarSubtitle = cache(async (profileId: string): Promise<string> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('unit_members')
    .select('units(label, residences(name))')
    .eq('profile_id', profileId)
    .is('ended_at', null)
    .maybeSingle()

  if (error) {
    console.error('[resident-top-bar] lettura membership fallita', { profileId, code: error.code, message: error.message })
    return topBarSubtitle({ state: 'error' })
  }
  const unit = data?.units as unknown as { label: string; residences: { name: string } | null } | null
  if (!unit) return topBarSubtitle({ state: 'no-unit' })
  const input: TopBarSubtitleInput = {
    state: 'ok',
    residenceName: unit.residences?.name ?? null,
    unitLabel: formatUnitLabel(unit.label),
  }
  return topBarSubtitle(input)
})
