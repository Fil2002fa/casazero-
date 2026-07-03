export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-24 animate-pulse">
      <div className="bg-surface border-b border-border px-4 py-4 sticky top-0 z-10">
        <div className="h-5 w-5 bg-border rounded" />
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-border/60 px-4 py-5 space-y-3">
            <div className="h-5 w-48 bg-border rounded" />
            <div className="h-3 w-36 bg-border rounded" />
            <div className="flex gap-2">
              <div className="h-6 w-20 bg-border rounded-full" />
              <div className="h-6 w-16 bg-border rounded-full" />
            </div>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="h-4 w-40 bg-border rounded" />
            <div className="h-3 w-28 bg-border rounded" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-border flex-shrink-0" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 bg-border rounded" />
              <div className="h-3 w-40 bg-border rounded" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-border rounded-lg flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 bg-border rounded" />
                <div className="h-3 w-20 bg-border rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
