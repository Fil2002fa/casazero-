import AdminSidebar from '@/components/AdminSidebar'
import { getWhitelabelBrand } from '@/lib/whitelabel'
import { getProfile } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ brandDark }, profile] = await Promise.all([
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
        {children}
      </main>
    </div>
  )
}
