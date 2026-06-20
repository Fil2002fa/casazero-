import Image from 'next/image'
import AdminSidebar from '@/components/AdminSidebar'
import { getWhitelabelBrand } from '@/lib/whitelabel'
import { getProfile } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ brandDark, logoUrl, builderName }, profile] = await Promise.all([
    getWhitelabelBrand(),
    getProfile(),
  ])

  const role = profile?.role ?? 'admin'

  return (
    <div
      className="flex h-screen overflow-hidden bg-[#F4F3EF]"
      style={{ '--wl-brand-dark': brandDark, '--wl-logo': logoUrl ? `url(${logoUrl})` : 'none' } as React.CSSProperties}
    >
      {/* Sidebar */}
      <AdminSidebar role={role} />

      {/* Content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex-shrink-0 flex items-center px-6 border-b border-[#E4E6E2] bg-white">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={builderName}
              width={120}
              height={32}
              className="object-contain h-8 w-auto"
              priority
            />
          ) : (
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--wl-brand-dark, #04342C)' }}
            >
              {builderName}
            </span>
          )}
        </header>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
