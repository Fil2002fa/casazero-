export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-border rounded" />
          <div className="h-3 w-20 bg-border rounded" />
        </div>
        <div className="h-9 w-24 bg-border rounded-lg" />
      </header>

      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <div className="space-y-2">
              <div className="h-4 w-44 bg-border rounded" />
              <div className="h-3 w-56 bg-border rounded" />
            </div>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map(j => (
                <div key={j} className="space-y-1.5">
                  <div className="h-4 w-8 bg-border rounded mx-auto" />
                  <div className="h-2.5 w-12 bg-border rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
