export default function Loading() {
  return (
    <div role="status" aria-label="Caricamento dati personali" className="p-4 pb-28 space-y-4 max-w-lg mx-auto animate-pulse">
      <div className="h-11 w-48 rounded bg-border" />
      <div className="bg-surface rounded-xl border border-border p-4 space-y-5">
        {[0, 1, 2].map(index => <div key={index} className="space-y-2">
          <div className="h-3 w-24 rounded bg-border" />
          <div className="h-5 w-2/3 rounded bg-border" />
        </div>)}
        <div className="h-11 w-full rounded-lg bg-border" />
      </div>
    </div>
  )
}
