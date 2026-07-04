/**
 * Pluralizzazione italiana. Fonte unica: mai ricalcolare inline il ramo n===1.
 * Esempi: pluralize(1, 'mese', 'mesi') → "1 mese"; pluralize(3, 'mese', 'mesi') → "3 mesi".
 */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
