/**
 * Etichette del modello a due assi delle manutenzioni (v2), senza dipendenze
 * da React: le leggono i badge (MaintenanceBadge) e l'export Excel. Fonte
 * unica per il codice nuovo. Restano copie equivalenti in ui/Badge.tsx
 * (OBLIGATION_LABELS), formatRegisteredBy.ts (MODE_LABELS) e nello stato di
 * ui/Badge.tsx: non sbagliate, ma da riportare qui in un commit di sola pulizia.
 *
 * Modalità (`completion_mode`) = chi completa. Tipo (`obligation_type`) =
 * vincolo. La sigla N1/N2/N3 è abolita.
 */
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'

export const MODE_LABELS: Record<CompletionMode, string> = {
  residente:      'Residente',
  amministratore: 'Amministratore',
  promemoria:     'Promemoria',
}

export const OBLIGATION_LABELS: Record<ObligationType, string> = {
  A: 'Obbligo di legge',
  B: 'Raccomandata',
  C: 'Consiglio',
}

// Stessa parola dello StatusBadge: lo stato "in_attesa" si legge "Pianificata".
export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scaduta:    'Scaduta',
  in_corso:   'In corso',
  in_attesa:  'Pianificata',
  completata: 'Completata',
}
