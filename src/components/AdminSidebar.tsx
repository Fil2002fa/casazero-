'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users, Wrench, Settings, Activity, type LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/database'
import { BrandMark } from '@/components/BrandMark'

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
    <aside className="w-60 flex-shrink-0 flex flex-col bg-background">
      <div className="h-14 flex-shrink-0 flex items-center px-3">
        <BrandMark />
      </div>

      <nav aria-label="Navigazione admin" className="flex-1 px-3 pb-3">
        <ul className="space-y-0.5">
          {items.map(({ href, icon: Icon, label, badge, dividerBefore }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                {dividerBefore && (
                  <hr className="my-2 border-0 border-t border-border" />
                )}
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 h-9 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2 ${
                    isActive
                      ? 'bg-brand-dark text-white'
                      : 'text-text-primary hover:bg-[rgb(4_52_44/0.06)]'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="text-[10px] font-medium leading-none px-1.5 py-0.5 rounded-full bg-[rgb(4_52_44/0.08)] text-text-secondary uppercase tracking-wide">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
