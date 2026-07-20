import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

// GET /api/reconcile-documents
// Diagnostica manuale (B1): elenca i file nel bucket `documents` che non
// hanno una riga corrispondente in `documents.storage_path` — l'orfano
// prodotto quando l'upload client-direct riesce ma confirmDocument non
// arriva mai (tab chiusa, rete caduta). Solo report, nessuna cancellazione:
// l'eventuale pulizia resta una decisione manuale di chi legge il report,
// da fare a mano dalla dashboard Supabase Storage.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const admin = createServiceClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 })
  }

  const { data: residences } = await admin
    .from('residences')
    .select('id')
    .eq('builder_id', profile.builder_id)

  const residenceIds = (residences ?? []).map(r => r.id)
  if (residenceIds.length === 0) {
    return NextResponse.json({ residencesChecked: 0, dbPathsCount: 0, storagePathsCount: 0, orphanCount: 0, orphans: [] })
  }

  const { data: docRows } = await admin
    .from('documents')
    .select('storage_path')
    .in('residence_id', residenceIds)

  const dbPaths = new Set((docRows ?? []).map(d => d.storage_path))

  const storagePaths: string[] = []
  for (const residenceId of residenceIds) {
    storagePaths.push(...await listAllFiles(admin, residenceId))
  }

  const orphans = storagePaths.filter(p => !dbPaths.has(p))

  return NextResponse.json({
    residencesChecked: residenceIds.length,
    dbPathsCount: dbPaths.size,
    storagePathsCount: storagePaths.length,
    orphanCount: orphans.length,
    orphans,
  })
}

// Ricorsiva: le cartelle nel bucket compaiono come entry con id === null
// (nessun oggetto reale, solo prefisso), i file hanno un id valorizzato.
async function listAllFiles(
  admin: ReturnType<typeof createServiceClient>,
  prefix: string
): Promise<string[]> {
  const { data, error } = await admin.storage.from('documents').list(prefix, { limit: 1000 })
  if (error || !data) return []

  const paths: string[] = []
  for (const entry of data) {
    const fullPath = `${prefix}/${entry.name}`
    if (entry.id === null) {
      paths.push(...await listAllFiles(admin, fullPath))
    } else {
      paths.push(fullPath)
    }
  }
  return paths
}
