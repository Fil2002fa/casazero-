import { pluralize } from './pluralize'

export function formatFrequency(months: number | null | undefined): string {
  if (months == null) return 'ogni ? mesi'
  return `ogni ${pluralize(months, 'mese', 'mesi')}`
}
