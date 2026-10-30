import type { UserRole } from '@/types/database'

// Etichetta italiana del ruolo UTENTE (profiles.role). Da non confondere con
// le etichette della modalità di completamento (MODE_LABELS in
// formatRegisteredBy.ts), che usano parole simili per un asse diverso.
const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Costruttore',
  admin: 'Amministratore',
  client: 'Residente',
}

export function roleLabel(role: UserRole | string | null | undefined): string {
  if (role && role in ROLE_LABELS) return ROLE_LABELS[role as UserRole]
  return 'Ruolo non riconosciuto'
}
