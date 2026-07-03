export default function Loading() {
  return (
    <div className="p-6 space-y-6 pb-safe animate-pulse">
      <div className="h-5 w-5 bg-border rounded" />

      <header className="space-y-2">
        <div className="h-3 w-24 bg-border rounded" />
        <div className="h-6 w-56 bg-border rounded" />
        <div className="h-4 w-36 bg-border rounded" />
      </header>

      <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-3 w-24 bg-border rounded" />
            <div className="h-3 w-32 bg-border rounded" />
          </div>
        ))}
      </div>

      <div className="h-11 w-full bg-border rounded-lg" />
    </div>
  )
}
