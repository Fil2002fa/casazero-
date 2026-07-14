export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Stessa intestazione in griglia della pagina: niente barra sticky, il
          padding lo dà il container del layout. */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-5 w-5 bg-border rounded" />
        <div className="space-y-1.5">
          <div className="h-4 w-32 bg-border rounded" />
          <div className="h-3 w-24 bg-border rounded" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-8 w-20 bg-border rounded-full" />
          ))}
        </div>

        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-2">
              <div className="h-3 w-24 bg-border rounded" />
              <div className="h-4 w-52 bg-border rounded" />
              <div className="h-3 w-36 bg-border rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
