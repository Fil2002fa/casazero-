import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { UploadDocumentForm } from '@/components/UploadDocumentForm'
import type { DocumentCategory, Profile } from '@/types/database'
import { DocumentiList, type DocItem } from './DocumentiList'

export const metadata: Metadata = { title: 'Documenti' }

type DocRow = {
  id: string
  title: string
  category: DocumentCategory
  file_name: string
  storage_path: string
  file_date: string | null
  created_at: string
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Residenza per il form di upload
async function uploadResidenceId(supabase: ServerClient, profile: Profile): Promise<string | null> {
  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('admin_assignments')
      .select('residence_id')
      .eq('profile_id', profile.id)
      .limit(1)
      .maybeSingle()
    return data?.residence_id ?? null
  }
  if (profile.role === 'super_admin') {
    const { data } = await supabase
      .from('residences')
      .select('id')
      .limit(1)
      .maybeSingle()
    return data?.id ?? null
  }
  const { data } = await supabase
    .from('unit_members')
    .select('units(residence_id)')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()
  return (data?.units as unknown as { residence_id: string } | null)?.residence_id ?? null
}

export default async function DocumentiPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const canUpload = profile.role === 'admin' || profile.role === 'super_admin'

  // In parallelo: la residenza per l'upload e i documenti non dipendono l'una
  // dagli altri. Documenti accessibili via RLS, tutti: filtri e ricerca
  // avvengono in memoria nel componente client, senza ricaricare la pagina.
  const [residenceId, { data: rawDocs }] = await Promise.all([
    uploadResidenceId(supabase, profile),
    supabase
      .from('documents')
      .select('id, title, category, file_name, storage_path, file_date, created_at')
      .order('created_at', { ascending: false }),
  ])

  // Date formattate qui sul server e passate come stringhe: formattarle nel
  // client darebbe testo diverso fra Node e Safari e un mismatch di hydration.
  const docs: DocItem[] = ((rawDocs ?? []) as DocRow[]).map(doc => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    file_name: doc.file_name,
    storage_path: doc.storage_path,
    formattedDate: new Date(doc.file_date ?? doc.created_at).toLocaleDateString('it-IT', {
      day: 'numeric', month: 'short', year: 'numeric',
    }),
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
