import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Documenti' }

export default function DocumentiPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-medium text-text-primary">Documenti</h1>
      <p className="text-sm text-text-secondary">
        Archivio certificati, garanzie e planimetrie in arrivo con M3.
      </p>
    </div>
  )
}
