export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-8 pt-8 pb-12 animate-pulse">
      <div className="h-4 w-24 bg-border rounded mb-6" />

      {/* Testata */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-24 h-[72px] rounded-xl bg-border flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-7 w-64 bg-border rounded" />
            <div className="h-4 w-40 bg-border rounded" />
          </div>
        </div>
      </div>

      {/* Gestione — quick-nav sotto la testata */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-4">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-border rounded-lg flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-20 bg-border rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Numeri chiave */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-2">
            <div className="h-3 w-16 bg-border rounded" />
            <div className="h-7 w-10 bg-border rounded" />
          </div>
        ))}
      </div>

      {/* Amministratore */}
      <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center gap-3 mt-8">
        <div className="w-8 h-8 rounded-full bg-border flex-shrink-0" />
        <div className="space-y-1.5">
          <div className="h-4 w-32 bg-border rounded" />
          <div className="h-3 w-40 bg-border rounded" />
        </div>
      </div>

      {/* Tabella unità */}
      <div className="mt-8">
        <div className="h-5 w-32 bg-border rounded mb-3" />
        <div className="bg-surface rounded-xl border border-border h-40" />
      </div>

      {/* Piano manutenzioni — riepilogo compatto + bottone */}
      <div className="mt-8">
        <div className="h-5 w-40 bg-border rounded mb-3" />
        <div className="bg-surface rounded-xl border border-border h-24" />
        <div className="h-11 md:h-9 w-52 bg-border rounded-lg mt-3" />
      </div>
    </div>
  )
}
