export default function Loading() {
  return (
    <div className="p-6 space-y-6 pb-safe animate-pulse">
      <header className="space-y-2">
        <div className="h-3 w-32 bg-border rounded" />
        <div className="h-6 w-44 bg-border rounded" />
      </header>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="h-36 bg-border/60" />
        <div className="px-4 py-3 space-y-2">
          <div className="h-4 w-40 bg-border rounded" />
          <div className="h-3 w-24 bg-border rounded" />
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border px-4 py-3 space-y-2">
        <div className="h-4 w-48 bg-border rounded" />
        <div className="h-3 w-32 bg-border rounded" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 h-20 flex items-center gap-3">
            <div className="w-5 h-5 bg-border rounded" />
            <div className="h-4 w-20 bg-border rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
