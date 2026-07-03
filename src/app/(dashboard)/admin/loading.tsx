export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-3 w-28 bg-border rounded" />
        <div className="h-6 w-56 bg-border rounded" />
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-3 space-y-2">
            <div className="h-7 w-10 bg-border rounded mx-auto" />
            <div className="h-3 w-14 bg-border rounded mx-auto" />
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
