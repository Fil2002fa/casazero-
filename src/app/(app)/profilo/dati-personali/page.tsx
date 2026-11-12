import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DatiPersonaliClient } from './DatiPersonaliClient'

export const metadata: Metadata = { title: 'Dati personali' }

export default async function DatiPersonaliPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/auth/login')
  const { data: profile, error } = await supabase.from('profiles')
    .select('full_name, phone').eq('id', user.id).single()
  if (error || !profile) console.error('Dati personali: lettura fallita', error)

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/profilo" aria-label="Torna al profilo" className="flex items-center justify-center w-11 h-11 -ml-3 -mr-2 shrink-0 text-text-secondary rounded-lg active:bg-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
        </Link>
        <h1 className="font-serif text-[22px] font-semibold text-text-primary">Dati personali</h1>
      </header>
      <div className="p-4 max-w-lg mx-auto">
        {error || !profile ? (
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <p role="alert" className="text-sm text-semantic-red">Impossibile caricare i dati personali. Riprova.</p>
            <Link href="/profilo/dati-personali" className="inline-flex min-h-11 items-center text-sm text-brand-dark underline">Riprova</Link>
          </section>
        ) : <DatiPersonaliClient fullName={profile.full_name} phone={profile.phone} email={user.email ?? ''} />}
      </div>
    </div>
  )
}
