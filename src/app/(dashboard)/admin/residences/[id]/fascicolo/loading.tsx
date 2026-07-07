export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-24 animate-pulse">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="h-5 w-5 bg-border rounded" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 bg-border rounded" />
          <div className="h-3 w-32 bg-border rounded" />
        </div>
      </div>

      <div className="p-4">
        <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-border rounded" style={{ width: `${70 - i * 8}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
