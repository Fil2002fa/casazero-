'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users, Wrench, Settings, Activity, type LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/database'

type NavItem = {
  href: string
  icon: LucideIcon
  label: string
  badge?: string
  dividerBefore?: boolean
}

const SUPER_ADMIN_ITEMS: NavItem[] = [
  { href: '/admin/residences', icon: Building2, label: 'Residenze' },
  { href: '/admin/administrators', icon: Users, label: 'Amministratori' },
  { href: '/admin/attivita', icon: Activity, label: 'Attività', badge: 'test' },
  { href: '/admin/settings', icon: Settings, label: 'Impostazioni', dividerBefore: true },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin/manutenzioni', icon: Wrench, label: 'Manutenzioni' },
]

interface Props {
  role: UserRole | string
}

export default function AdminSidebar({ role }: Props) {
  const pathname = usePathname()
  const items = role === 'super_admin' ? SUPER_ADMIN_ITEMS : ADMIN_ITEMS

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col"
      style={{ backgroundColor: 'var(--wl-brand-dark, #04342C)' }}
    >
      <nav className="flex-1 p-3 pt-4 space-y-0.5" aria-label="Navigazione admin">
        {items.map(({ href, icon: Icon, label, badge, dividerBefore }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <div key={href}>
              {dividerBefore && (
                <hr className="my-2 border-0 border-t border-white/10" />
              )}
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span className="text-[10px] font-medium leading-none px-1.5 py-0.5 rounded-full bg-white/15 text-white/70 uppercase tracking-wide">
                    {badge}
                  </span>
                )}
              </Link>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
