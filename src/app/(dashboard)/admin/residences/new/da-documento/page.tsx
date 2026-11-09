import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { ConditionalTemplate } from '@/lib/residence-draft'
import { DaDocumentoClient } from './DaDocumentoClient'

export const metadata: Metadata = { title: 'Nuova residenza da documento' }

// L'accesso (solo super_admin) lo decide new/layout.tsx. Qui si leggono i due
// dati che la revisione non può avere da sola:
//  · i template condizionali, per contare le voci che un "no" non genera;
//  · gli indirizzi delle residenze del costruttore, per l'avviso "già usato"
//    (lo scoping è della RLS: czero_can_access_residence).
// Sola lettura: la pagina non scrive nulla.
export default async function NewResidenceFromDocumentPage() {
  const supabase = await createClient()

  const [templatesRes, residencesRes] = await Promise.all([
    supabase
      .from('maintenance_templates')
      .select('condition_key, scope, is_active')
      .not('condition_key', 'is', null),
    supabase.from('residences').select('address'),
  ])

  // Un error è un guasto tecnico, mai un elenco vuoto: senza i template il
  // conteggio "N voci non verranno generate" direbbe 0 e sarebbe falso.
  if (templatesRes.error || residencesRes.error) {
    console.error('[da-documento] lettura dati fallita', {
      templates: templatesRes.error,
      residences: residencesRes.error,
    })
    return (
      <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-4 space-y-2">
        <p className="text-sm text-semantic-red">
          Errore tecnico nel caricare i dati della pagina. Riprova tra poco.
        </p>
        <Link href="/admin/residences/new" className="text-sm text-brand-medium font-medium">
          Torna alla creazione manuale
        </Link>
      </div>
    )
  }

  const templates: ConditionalTemplate[] = (templatesRes.data ?? []).flatMap(t =>
    t.scope === 'unit' || t.scope === 'condominium'
      ? [{ condition_key: t.condition_key, scope: t.scope, is_active: t.is_active === true }]
      : [],
  )
  const existingAddresses = (residencesRes.data ?? [])
    .map(r => r.address)
    .filter((a): a is string => typeof a === 'string' && a.trim() !== '')

  return <DaDocumentoClient templates={templates} existingAddresses={existingAddresses} />
}
