import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fascicolo' }

export default function FascicoloPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-medium text-text-primary">Fascicolo</h1>
      <p className="text-sm text-text-secondary">
        Storico interventi e conformità in arrivo con M3.
      </p>
    </div>
  )
}
