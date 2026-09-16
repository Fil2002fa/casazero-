'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users, Wrench, Settings, HardHat, Menu, X, type LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/database'
import { BrandMark } from '@/components/BrandMark'
import { useDialogFocus } from '@/components/ui/useDialogFocus'

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
  { href: '/admin/fornitori', icon: HardHat, label: 'Fornitori' },
  // Nascosta per la demo Furlan: /admin/attivita serve dati demo finti (vedi
  // commento in attivita/page.tsx:35-36), non un feed reale. Riattivare
  // scommentando questa riga (e reintrodurre `Activity` nell'import sopra)
  // quando il feed sarà collegato a eventi reali.
  // { href: '/admin/attivita', icon: Activity, label: 'Attività', badge: 'test' },
  { href: '/admin/settings', icon: Settings, label: 'Impostazioni', dividerBefore: true },
]

// "Attività" per l'admin punta a /admin/manutenzioni (vista trasversale reale),
// non a /admin/attivita che è la pagina demo del super_admin. Stessa etichetta,
// due rotte, voluto. Impostazioni assente: la pagina settings è identità del
// costruttore, all'admin serve una vista sua, non ancora disegnata.
const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin/residences', icon: Building2, label: 'Residenze' },
  { href: '/admin/manutenzioni', icon: Wrench, label: 'Attività' },
]

const LG_QUERY = '(min-width: 1024px)'

interface Props {
  role: UserRole | string
}

// Marchio + voci, scritti una volta e montati in due contenitori: la sidebar
// fissa da lg in su e il drawer sotto lg. Le due forme non possono divergere.
// Voci alte 44px nel drawer (touch) e 36px nella sidebar: ciascun contenitore
// esiste su un solo lato di lg, quindi l'altezza segue lo stesso breakpoint.
function NavContent({ role, onNavigate, brandAction }: Props & {
  // Chiude il drawer anche quando la voce punta alla pagina corrente, dove il
  // pathname non cambia.
  onNavigate?: () => void
  brandAction?: React.ReactNode
}) {
  const pathname = usePathname()
  const items = role === 'super_admin' ? SUPER_ADMIN_ITEMS : ADMIN_ITEMS

  return (
    <>
      <div className="h-14 flex-shrink-0 flex items-center">
        <Link
          href="/admin/residences"
          onClick={onNavigate}
          className="h-14 flex-1 flex items-center px-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
        >
          <BrandMark />
        </Link>
        {brandAction}
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
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 h-11 lg:h-9 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2 ${
                    isActive
                      ? 'bg-brand-dark text-white'
                      : 'text-text-primary hover:bg-brand-dark/6'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="text-xs font-medium leading-none px-1.5 py-0.5 rounded-full bg-brand-dark/8 text-text-secondary">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

// Sidebar fissa: esiste solo da lg in su. Sotto lg la navigazione è MobileNav.
export default function AdminSidebar({ role }: Props) {
  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col bg-background">
      <NavContent role={role} />
    </aside>
  )
}

// Navigazione sotto lg: hamburger nell'header, drawer da sinistra, dove sta la
// sidebar da lg in su. Niente bottom nav: è la grammatica della PWA residente,
// e le due shell devono restare distinguibili a colpo d'occhio.
//
// Il drawer NON va in un portal su body: BrandMark legge --wl-brand-dark, che
// la shell imposta inline sul proprio contenitore. Fuori da quel contenitore il
// marchio perderebbe il colore del costruttore. `fixed` basta: nessun antenato
// ha transform o contain, quindi il pannello si posiziona sul viewport.
export function MobileNav({ role }: Props) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const panelRef = useRef<HTMLDivElement>(null)

  useDialogFocus(open, close, panelRef)

  // Se la finestra si allarga oltre lg con il drawer aperto, il pannello sparisce
  // (lg:hidden) ma il focus resterebbe intrappolato dentro: lo si chiude.
  useEffect(() => {
    if (!open) return
    const mq = window.matchMedia(LG_QUERY)
    function handleChange(e: MediaQueryListEvent) {
      if (e.matches) close()
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [open, close])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="lg:hidden -ml-3 inline-flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-lg text-neutral-600 hover:bg-brand-dark/6 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
      >
        <Menu className="w-5 h-5" strokeWidth={1.8} />
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-modal-backdrop bg-brand-dark/40"
          onClick={close}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className="z-modal fixed inset-y-0 left-0 w-60 flex flex-col overflow-y-auto bg-background shadow-elevated outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <NavContent
              role={role}
              onNavigate={close}
              brandAction={
                <button
                  type="button"
                  onClick={close}
                  aria-label="Chiudi menu"
                  className="mr-1 inline-flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-lg text-neutral-600 hover:bg-brand-dark/6 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
                >
                  <X className="w-5 h-5" strokeWidth={1.8} />
                </button>
              }
            />
          </div>
        </div>
      )}
    </>
  )
}
