export default function Loading() {
  return (
    <div className="p-6 space-y-6 pb-safe animate-pulse">
      <header className="space-y-2">
        <div className="h-6 w-36 bg-border rounded" />
      </header>

      <div className="h-10 w-full bg-border rounded-lg" />

      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 w-24 bg-border rounded-full flex-shrink-0" />
        ))}
      </div>

      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-border rounded-lg flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-48 bg-border rounded" />
              <div className="h-3 w-28 bg-border rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
