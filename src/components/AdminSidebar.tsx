'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Wrench, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/admin/residences', icon: Building2, label: 'Residenze' },
  { href: '/admin/manutenzioni', icon: Wrench, label: 'Manutenzioni' },
  { href: '/admin/settings', icon: Settings, label: 'Impostazioni' },
] as const

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col"
      style={{ backgroundColor: 'var(--wl-brand-dark, #04342C)' }}
    >
      <nav className="flex-1 p-3 pt-4 space-y-0.5" aria-label="Navigazione admin">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
