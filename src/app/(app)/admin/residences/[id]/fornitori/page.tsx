import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { FornitoriManager } from './FornitoriManager'

export const metadata: Metadata = { title: 'Fornitori' }

type Params = Promise<{ id: string }>

export default async function FornitoriPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, phone, email, categories')
    .eq('residence_id', residenceId)
    .order('name')

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/admin/residences/${residenceId}`} className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div>
          <h1 className="text-base font-medium text-text-primary">Fornitori</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
      </div>

      <div className="p-4">
        <FornitoriManager
          residenceId={residenceId}
          suppliers={(suppliers ?? []) as { id: string; name: string; phone: string | null; email: string | null; categories: string[] }[]}
        />
      </div>
    </div>
  )
}
