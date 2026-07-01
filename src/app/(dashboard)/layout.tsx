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
        <header className="h-14 flex-shrink-0 flex items-center gap-2 px-6 border-b border-[#E4E6E2] bg-white">
          {/* Logo: foglia SVG inline (nessuna dipendenza da storage/whitelabel) */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            style={{ color: 'var(--wl-brand-dark, #04342C)' }}
          >
            <path
              d="M20 4C10.5 4 4 9.5 4 18.5c0 .55.4 1 .95 1C13.5 19.5 20 13.5 20 4z"
              fill="currentColor"
            />
            <path
              d="M7 17C10.5 11.5 13.5 9 17.5 7.5"
              stroke="#FFFFFF"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <span
            className="font-medium text-sm"
            style={{ color: 'var(--wl-brand-dark, #04342C)' }}
          >
            {builderName}
          </span>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
