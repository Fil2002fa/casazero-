export default function Loading() {
  return (
    <div className="p-6 space-y-6 pb-safe animate-pulse">
      <header className="space-y-2">
        <div className="h-3 w-40 bg-border rounded" />
        <div className="h-6 w-36 bg-border rounded" />
      </header>

      {[0, 1].map(section => (
        <section key={section} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 bg-border rounded" />
            <div className="h-3 w-6 bg-border rounded" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-2">
                <div className="h-3 w-24 bg-border rounded" />
                <div className="h-4 w-52 bg-border rounded" />
                <div className="h-3 w-36 bg-border rounded" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
