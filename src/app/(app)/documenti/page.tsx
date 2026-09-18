import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { UploadDocumentForm } from '@/components/UploadDocumentForm'
import { displayDate } from '@/lib/document-rows'
import { loadResidenceDocumentRows } from '@/lib/document-rows.server'
import { residentDocumentFacts } from '@/lib/resident-document-facts'
import type { Profile } from '@/types/database'
import { DocumentiList, type DocItem } from './DocumentiList'

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
      <div className="p-4 space-y-6 pb-safe">
        <h1 className="font-serif text-[22px] font-semibold text-text-primary">Documenti</h1>
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-base text-text-secondary">
            Non è stato possibile caricare i documenti. Riprova tra poco.
          </p>
        </div>
      </div>
    )
  }

  // Data in riga da displayDate, lo stesso helper della dashboard: data del
  // documento estratta, altrimenti quella inserita all'upload, altrimenti il
  // caricamento. Formattata qui sul server e passata come stringa:
  // formattarla nel client darebbe testo diverso fra Node e Safari e un
  // mismatch di hydration. I dati estratti arrivano già composti, e solo
  // quelli che il residente deve vedere (residentDocumentFacts).
  const docs: DocItem[] = rows.map(doc => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    file_name: doc.file_name,
    storage_path: doc.storage_path,
    formattedDate: new Date(displayDate(doc)).toLocaleDateString('it-IT', {
      day: 'numeric', month: 'short', year: 'numeric',
    }),
    facts: residentDocumentFacts(doc),
  }))

  return (
    <div className="p-4 space-y-6 pb-safe">
      <DocumentiList
        docs={docs}
        uploadSlot={canUpload && residenceId ? <UploadDocumentForm residenceId={residenceId} /> : undefined}
      />
    </div>
  )
}
