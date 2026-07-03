export default function Loading() {
  return (
    <div className="p-6 space-y-6 pb-safe animate-pulse">
      <header className="space-y-2">
        <div className="h-6 w-28 bg-border rounded" />
      </header>

      <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-border rounded-full flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-4 w-36 bg-border rounded" />
            <div className="h-3 w-48 bg-border rounded" />
          </div>
        </div>
      </div>

      {[0, 1].map(i => (
        <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <div className="h-4 w-32 bg-border rounded" />
          <div className="h-3 w-full bg-border rounded" />
          <div className="h-3 w-2/3 bg-border rounded" />
        </div>
      ))}
    </div>
  )
}
