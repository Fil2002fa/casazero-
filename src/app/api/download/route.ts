import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/download?bucket=attachments&path=xxx
// Genera un URL firmato (1 ora) e redirige → download sicuro senza esporre il percorso Storage
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const bucket = req.nextUrl.searchParams.get('bucket') ?? 'attachments'
  const path   = req.nextUrl.searchParams.get('path')

  if (!path) return NextResponse.json({ error: 'Parametro path mancante' }, { status: 400 })
  if (!['attachments', 'documents'].includes(bucket)) {
    return NextResponse.json({ error: 'Bucket non valido' }, { status: 400 })
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600, { download: true })

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Errore generazione URL' }, { status: 500 })
  }

  return NextResponse.redirect(data.signedUrl)
}
