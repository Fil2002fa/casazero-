export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-3 w-28 bg-border rounded" />
        <div className="h-6 w-56 bg-border rounded" />
      </header>

      {/* Stessa forma dei contatori-filtro: righe compatte in un solo contenitore */}
      <div className="rounded-xl border border-border bg-surface divide-y divide-border sm:grid sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-11 px-4 flex items-center justify-between">
            <div className="h-3 w-16 bg-border rounded" />
            <div className="h-4 w-6 bg-border rounded" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-2">
            <div className="h-3 w-24 bg-border rounded" />
            <div className="h-4 w-48 bg-border rounded" />
            <div className="h-3 w-32 bg-border rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
