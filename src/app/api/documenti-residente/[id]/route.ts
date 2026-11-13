import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ResidentDocMime } from '@/types/database'
import { RESIDENT_DOC_BUCKET, isLowerUuid, residentDocDownloadName } from '@/lib/resident-document-upload'

// GET /api/documenti-residente/{id}[?inline=1]
// File di un documento del residente. La riga si legge col client di sessione:
// RLS (059) la mostra solo a un client membro attivo della stessa unità di chi
// l'ha caricata, quindi "non trovata" vale anche per "non tua". Il path viene
// dalla riga, mai dalla richiesta. URL firmato da 60 secondi.
// Predefinito: scaricamento col titolo come nome file. Con inline=1 (valore
// esatto) si apre nel browser. /api/download resta per i documenti del costruttore.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) console.error('[documenti-residente] errore lettura sessione', authError)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  if (!isLowerUuid(id)) return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })

  const { data: row, error } = await supabase
    .from('resident_documents')
    .select('storage_path, title, mime_type')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[documenti-residente] lettura riga fallita', { userId: user.id, id, code: error.code, message: error.message })
    return NextResponse.json({ error: 'Errore temporaneo, riprova.' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })

  const inline = req.nextUrl.searchParams.get('inline') === '1'
  const { data, error: signError } = await supabase.storage
    .from(RESIDENT_DOC_BUCKET)
    .createSignedUrl(
      row.storage_path as string,
      60,
      inline ? undefined : { download: residentDocDownloadName(row.title as string, row.mime_type as ResidentDocMime) },
    )
  if (signError || !data) {
    console.error('[documenti-residente] firma fallita', { userId: user.id, id, error: signError })
    return NextResponse.json({ error: 'Il file non è disponibile. Riprova tra poco.' }, { status: 500 })
  }

  return NextResponse.redirect(data.signedUrl)
}
