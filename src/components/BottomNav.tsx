'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FolderOpen, Wrench, BookOpen, User } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/documenti', icon: FolderOpen, label: 'Documenti' },
  { href: '/manutenzioni', icon: Wrench, label: 'Manutenzioni' },
  { href: '/fascicolo', icon: BookOpen, label: 'Fascicolo' },
  { href: '/profilo', icon: User, label: 'Profilo' },
] as const

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-surface border-t border-border pb-safe z-sticky"
      aria-label="Navigazione principale"
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${
                isActive
                  ? 'text-brand-dark bg-brand-light'
                  : 'text-text-secondary hover:text-brand-medium hover:bg-background'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
