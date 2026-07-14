export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-6 w-36 bg-border rounded" />
        <div className="h-3 w-52 bg-border rounded" />
      </header>

      <div className="flex gap-2 border-b border-border pb-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-8 w-24 bg-border rounded-lg" />
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <div className="h-4 w-40 bg-border rounded" />
            <div className="h-9 w-full bg-border rounded-lg" />
            <div className="h-9 w-2/3 bg-border rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
