import Link from 'next/link'
import { Home } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'

// Un solo vuoto per i due ruoli: cambia il testo e l'azione, non il contenitore.
// L'amministratore non può creare residenze, quindi nessun bottone: il testo
// dice invece cosa deve succedere perché la lista si popoli.
export function ResidencesEmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
      <Home className="w-10 h-10 text-text-secondary mx-auto" strokeWidth={1.2} />
      <p className="text-sm text-text-secondary">
        {canCreate
          ? 'Nessuna residenza. Creane una per iniziare.'
          : 'Nessuna residenza assegnata. Il costruttore ti inviterà alle residenze che dovrai seguire.'}
      </p>
      {canCreate && (
        <Link href="/admin/residences/new" className={buttonVariants('primary', 'default', 'inline-flex')}>
          Crea prima residenza
        </Link>
      )}
    </div>
  )
}
