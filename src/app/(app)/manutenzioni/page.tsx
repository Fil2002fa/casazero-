import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Manutenzioni' }

export default function ManutenzioniPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-medium text-text-primary">Manutenzioni</h1>
      <p className="text-sm text-text-secondary">
        Scadenzario e regole N1/N2/N3 in arrivo con M2.
      </p>
    </div>
  )
}
