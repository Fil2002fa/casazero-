import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { getWhitelabelBrand } from '@/lib/whitelabel'
import { getProfile } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // In parallelo: la parte auth è comunque condivisa dalla cache() di src/lib/auth.ts
  const [profile, { brandDark, logoUrl }] = await Promise.all([
    getProfile(),
    getWhitelabelBrand(),
  ])
  if (profile && profile.role !== 'client') redirect('/admin')

  return (
    <div
      className="min-h-svh flex flex-col"
      style={{ '--wl-brand-dark': brandDark, '--wl-logo': logoUrl ? `url(${logoUrl})` : 'none' } as React.CSSProperties}
    >
      {/* Colonna centrata: stessa larghezza del contenuto della BottomNav
          (max-w-lg), così la nav resta allineata e non orfana su viewport
          larghi. Il background resta a piena pagina, è sul body. */}
      <main className="flex-1 w-full max-w-lg mx-auto pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}
