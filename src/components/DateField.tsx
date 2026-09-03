// Wrapper condiviso sul solo <input type="date"> nativo — mai la label, che
// nei 4 punti in cui è usato varia per posizione e tipografia (vertical vs
// orizzontale, marcatori obbligatorio/facoltativo diversi): forzarla in
// questo componente avrebbe richiesto una prop per ogni variante. className
// di default = lo stile ricorrente in 3 dei 4 punti; override esplicito solo
// dove il layout lo richiede davvero (page.tsx WIZARD_CATEGORIES: campo
// dentro una riga flex con label a sinistra, non una colonna a larghezza
// piena — flex-1/py-1.5 invece di w-full/py-2, stesso py-1.5 dei campi
// annidati in liste dense altrove, es. DocumentiClient.tsx:964).
export function DateField({
  name, required, min, max, defaultValue, className,
}: {
  name: string
  required?: boolean
  min?: string
  max?: string
  defaultValue?: string
  className?: string
}) {
  return (
    <input
      type="date"
      name={name}
      required={required}
      min={min}
      max={max}
      defaultValue={defaultValue}
      className={
        className ??
        'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium'
      }
    />
  )
}
