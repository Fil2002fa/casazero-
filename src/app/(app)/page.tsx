import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="p-6 space-y-6">
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">La tua residenza</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">Benvenuto</h1>
      </header>

      {/* Placeholder card residenza */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="h-32 bg-background rounded-lg flex items-center justify-center mb-4">
          <span className="text-text-secondary text-sm">Foto residenza</span>
        </div>
        <p className="text-sm text-text-secondary">
          Connesso come: {user?.email ?? '—'}
        </p>
      </div>

      {/* Scadenze placeholder */}
      <section>
        <h2 className="text-sm font-medium text-text-primary mb-3">Scadenze</h2>
        <div className="bg-surface rounded-xl border border-border p-4 text-sm text-text-secondary text-center py-8">
          Le manutenzioni arrivano con M2
        </div>
      </section>

      {/* Accessi rapidi */}
      <section className="grid grid-cols-2 gap-3">
        {[
          { label: 'Documenti', color: 'text-semantic-blue' },
          { label: 'Fascicolo', color: 'text-brand-medium' },
        ].map(({ label, color }) => (
          <div
            key={label}
            className="bg-surface rounded-xl border border-border p-4 flex items-center justify-center h-20"
          >
            <span className={`text-sm font-medium ${color}`}>{label}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
