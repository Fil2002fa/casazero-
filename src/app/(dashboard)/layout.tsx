import AdminSidebar from '@/components/AdminSidebar'
import { BuilderIdentityBar } from '@/components/BuilderIdentity'
import { getWhitelabelBrand } from '@/lib/whitelabel'
import { getProfile } from '@/lib/auth'
import { CONTENT_GRID, CONTENT_RHYTHM } from '@/lib/layout'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ brandDark, logoUrl, builderName }, profile] = await Promise.all([
    getWhitelabelBrand(),
    getProfile(),
  ])

  const role = profile?.role ?? 'admin'

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      style={{ '--wl-brand-dark': brandDark } as React.CSSProperties}
    >
      <AdminSidebar role={role} />

      <main className="flex-1 overflow-auto">
        {/* Identità costruttore — CasaZero resta il marchio della sidebar (BrandMark) */}
        <BuilderIdentityBar name={builderName} logoSrc={logoUrl} />

        {/* Container unico del contenuto: le pagine non dichiarano più padding né
            larghezza proprie, li prendono da qui (src/lib/layout.ts). */}
        <div className={`${CONTENT_GRID} ${CONTENT_RHYTHM}`}>
          {children}
        </div>
      </main>
    </div>
  )
}
