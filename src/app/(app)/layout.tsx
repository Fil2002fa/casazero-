import BottomNav from '@/components/BottomNav'
import { getWhitelabelBrand } from '@/lib/whitelabel'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { brandDark, logoUrl } = await getWhitelabelBrand()

  return (
    <div
      className="min-h-svh flex flex-col"
      style={{ '--wl-brand-dark': brandDark, '--wl-logo': logoUrl ? `url(${logoUrl})` : 'none' } as React.CSSProperties}
    >
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}
