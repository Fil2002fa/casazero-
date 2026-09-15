import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

// Titolo di pagina: Display serif, un solo stile per ogni H1 della dashboard
// (DESIGN.md, Typography → Display). Esportato per la sola testata che non passa
// da PageHeader: il nome residenza nella card con la foto (ResidencePhotoUpload).
// break-words (non break-all): un nome normale va a capo tra le parole, e solo una
// parola più larga dello spazio (es. __TEST_ACCENSIONE__) viene spezzata invece di
// far scorrere la pagina di lato. Funziona se il contenitore ha min-w-0.
export const PAGE_TITLE = 'font-serif text-3xl font-semibold text-text-primary text-balance break-words'

interface BackLinkProps {
  href: string
  label: string
  className?: string
}

// Ritorno alla pagina madre con il nome della destinazione scritto, invece della
// sola freccia senza nome accessibile. Sotto lg l'area toccabile è alta 44px.
export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 min-h-11 lg:min-h-0 -ml-1 px-1 text-sm text-text-secondary hover:text-text-primary rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2',
        className,
      )}
    >
      <ChevronLeft className="w-4 h-4 flex-shrink-0" strokeWidth={1.6} />
      {label}
    </Link>
  )
}

interface PageHeaderProps {
  title: string
  back?: { href: string; label: string }
  description?: string
  actions?: React.ReactNode
  className?: string
}

// Testata di pagina della dashboard: ritorno facoltativo, titolo, descrizione,
// azioni. Da sm in su le azioni stanno a destra del titolo; sotto sm vanno a capo
// sotto il titolo. Nessun menu "…": su mobile ogni funzione resta visibile.
export function PageHeader({ title, back, description, actions, className }: PageHeaderProps) {
  return (
    <header className={className}>
      {back && <BackLink href={back.href} label={back.label} className="lg:mb-3" />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {description && <p className="text-sm text-text-secondary mt-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3 sm:flex-shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
