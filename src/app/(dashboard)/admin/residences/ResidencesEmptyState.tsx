import Link from 'next/link'
import { Home } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'

export function ResidencesEmptyState() {
  return (
    <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
      <Home className="w-10 h-10 text-text-secondary mx-auto" strokeWidth={1.2} />
      <p className="text-sm text-text-secondary">Nessuna residenza. Creane una per iniziare.</p>
      <Link href="/admin/residences/new" className={buttonVariants('primary', 'default', 'inline-flex')}>
        Crea prima residenza
      </Link>
    </div>
  )
}
