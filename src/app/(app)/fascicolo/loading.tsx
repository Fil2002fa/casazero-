export default function Loading() {
  return (
    <div className="p-6 space-y-6 pb-safe animate-pulse">
      <header className="space-y-2">
        <div className="h-6 w-32 bg-border rounded" />
        <div className="h-3 w-48 bg-border rounded" />
      </header>

      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-border rounded-full flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-52 bg-border rounded" />
              <div className="h-3 w-32 bg-border rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
