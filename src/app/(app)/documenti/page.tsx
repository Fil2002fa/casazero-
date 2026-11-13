import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { UploadDocumentForm } from '@/components/UploadDocumentForm'
import { loadResidenceDocumentRows } from '@/lib/document-rows.server'
import { toResidentDocumentItems } from '@/lib/resident-documents-view'
import type { Profile } from '@/types/database'
import home from '../home.module.css'
import { DocumentiList } from './DocumentiList'

export const metadata: Metadata = { title: 'Documenti' }

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Residenza di cui mostrare i documenti (e in cui caricarli, per chi può).
// `error` distinto da "nessuna residenza": il primo è un fallimento tecnico.
async function residenceIdFor(
  supabase: ServerClient,
  profile: Profile,
): Promise<{ residenceId: string | null; error: string | null }> {
  if (profile.role === 'admin') {
    const { data, error } = await supabase
      .from('admin_assignments')
      .select('residence_id')
      .eq('profile_id', profile.id)
      .limit(1)
      .maybeSingle()
    return { residenceId: data?.residence_id ?? null, error: error?.message ?? null }
  }
  if (profile.role === 'super_admin') {
    const { data, error } = await supabase
      .from('residences')
      .select('id')
      .limit(1)
      .maybeSingle()
    return { residenceId: data?.id ?? null, error: error?.message ?? null }
  }
  const { data, error } = await supabase
    .from('unit_members')
    .select('units(residence_id)')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()
  const residenceId = (data?.units as unknown as { residence_id: string } | null)?.residence_id ?? null
  return { residenceId, error: error?.message ?? null }
}

export default async function DocumentiPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const canUpload = profile.role === 'admin' || profile.role === 'super_admin'

  // Stesso loader della pagina Documenti della dashboard e dell'export, col
  // client di sessione: RLS limita il residente ai documenti della propria
  // unità e della residenza. Serve la residenza prima dei documenti, quindi
  // le due letture sono in serie. Filtri e ricerca restano in memoria nel
  // componente client, senza ricaricare la pagina.
  const { residenceId, error: residenceError } = await residenceIdFor(supabase, profile)
  if (residenceError) {
    console.error('[documenti-pwa] lettura residenza fallita', { profileId: profile.id, error: residenceError })
  }
  const { docs: rows, error: docsError } = residenceId
    ? await loadResidenceDocumentRows(supabase, residenceId)
    : { docs: [], error: null }

  if (residenceError || docsError) {
    return (
      <div className={`${home.home} pb-safe`}>
        <div className={home.eyebrow}>La tua casa</div>
        <h1 className={home.pageTitle}>Documenti<span>.</span></h1>
        <div className={home.empty}>
          <strong>Documenti non disponibili</strong>
          Non è stato possibile caricarli. Riprova tra poco.
        </div>
      </div>
    )
  }

  // Una voce per file+tipo (versioni raggruppate, come nella home), con titolo,
  // data, riga sotto e dati estratti già composti sul server: la data passa da
  // formatDateIT, identica in Node e in Safari, quindi niente mismatch di
  // hydration. I dati estratti sono solo quelli che il residente deve vedere
  // (residentDocumentFacts).
  const items = toResidentDocumentItems(rows)

  return (
    <DocumentiList
      items={items}
      uploadSlot={canUpload && residenceId ? <UploadDocumentForm residenceId={residenceId} /> : undefined}
    />
  )
}
