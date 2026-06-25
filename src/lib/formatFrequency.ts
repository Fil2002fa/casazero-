export function formatFrequency(months: number | null | undefined): string {
  if (months == null) return 'ogni ? mesi'
  return `ogni ${months} ${months === 1 ? 'mese' : 'mesi'}`
}
