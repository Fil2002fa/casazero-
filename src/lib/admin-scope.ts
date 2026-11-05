import type { createClient } from '@/lib/supabase/server'

type SessionClient = Awaited<ReturnType<typeof createClient>>

export type AdminScope = 'in_scope' | 'out_of_scope' | 'error'

/**
 * Perimetro di un admin (condominio) rispetto al super_admin che chiama.
 * Fonte di verità unica: lo decide la RLS con il client di SESSIONE, mai il
 * service client (che la RLS non vede). Un super_admin vede un admin solo se ha
 * il suo builder_id o è assegnato a una sua residenza (policy su profiles), la
 * stessa regola del selettore in residences/[id]/page.tsx.
 *
 * Va chiamata PRIMA di qualsiasi lettura o scrittura con il service client
 * che usa un profileId arrivato dal client.
 *
 * 'error' è un guasto tecnico, distinto da 'out_of_scope' (esito di dominio):
 * chi chiama deve mostrare "riprova", non "non trovato".
 */
export async function checkAdminInScope(
  supabase: SessionClient,
  profileId: string,
): Promise<AdminScope> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .eq('role', 'admin')
    .maybeSingle()
  if (error) {
    console.error('checkAdminInScope: errore lettura perimetro admin', { profileId, error })
    return 'error'
  }
  return data ? 'in_scope' : 'out_of_scope'
}
