import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Amministratori — CasaZero' }

export default async function AdministratorsPage() {
  await requireRole(['super_admin'])

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">Super Admin</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">Amministratori</h1>
      </header>
    </div>
  )
}
