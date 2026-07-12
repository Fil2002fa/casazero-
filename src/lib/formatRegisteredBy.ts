import type { CompletionMode } from '@/types/database'

// Fonte unica per la colonna "Registrato da" del fascicolo (schermo + PDF).
// performed_by_name è opzionale per costruzione: il completamento residente
// (completeN2) non lo scrive mai, quello amministratore (completeN3) solo se
// il campo viene compilato. Fallback su un'etichetta statica per modalità
// effettiva — mai sul profilo (mutabile, il fascicolo deve restare identico).
const MODE_LABELS: Record<CompletionMode, string> = {
  residente:      'Residente',
  amministratore: 'Amministratore',
  promemoria:     'Autocertificato',
}

export function formatRegisteredBy(
  performedByName: string | null,
  itemCompletionMode: CompletionMode | null,
  templateCompletionMode: CompletionMode | null,
): string {
  if (performedByName) return performedByName
  const mode = itemCompletionMode ?? templateCompletionMode
  return mode ? MODE_LABELS[mode] : '—'
}
