import type { CompletionMode } from '@/types/database'

// Modalità (`completion_mode`) e legacy `priority`: fonte unica del dual-write.
// Debito tecnico intenzionale (CLAUDE.md): ogni scrittura che cambia la
// modalità aggiorna anche `priority` (promemoria→N1, residente→N2,
// amministratore→N3) finché le viste che la leggono non migrano. Il file è
// separato perché un modulo 'use server' può esportare solo funzioni async.

export const COMPLETION_MODES: readonly CompletionMode[] = ['amministratore', 'residente', 'promemoria']

export function isCompletionMode(v: unknown): v is CompletionMode {
  return typeof v === 'string' && (COMPLETION_MODES as readonly string[]).includes(v)
}

export function modeToPriority(mode: CompletionMode | null): string | null {
  if (mode === null) return null
  const map: Record<CompletionMode, string> = {
    promemoria:     'N1',
    residente:      'N2',
    amministratore: 'N3',
  }
  return map[mode]
}

export function priorityToMode(priority: string | null): CompletionMode | null {
  if (priority === null) return null
  const map: Record<string, CompletionMode> = {
    N1: 'promemoria',
    N2: 'residente',
    N3: 'amministratore',
  }
  return Object.prototype.hasOwnProperty.call(map, priority) ? map[priority] : null
}
