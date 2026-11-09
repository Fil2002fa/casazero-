import { forwardRef } from 'react'
import { DateField } from '@/components/DateField'

export function Field({
  label, name, placeholder, required, type = 'text', defaultValue,
}: {
  label: string; name: string; placeholder?: string; required?: boolean; type?: string
  defaultValue?: string
}) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      {type === 'date' ? (
        <DateField name={name} required={required} defaultValue={defaultValue} />
      ) : (
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          required={required}
          defaultValue={defaultValue}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
      )}
    </div>
  )
}

export const GenField = forwardRef<HTMLInputElement, {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; min?: string; max?: string; hint?: string
}>(function GenField(
  { label, value, onChange, placeholder, type = 'text', min, max, hint },
  ref
) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
      />
      {hint && <p className="text-xs text-text-secondary mt-1">{hint}</p>}
    </div>
  )
})
