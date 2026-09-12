'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Messaggio utente per la violazione dell'indice unico parziale della 039
// (builder_id, vat_number) WHERE vat_number IS NOT NULL. Non c'è un modo per
// distinguere questo da un altro unique-violation via error.code (PostgREST
// restituisce sempre 23505): si individua l'indice per nome dal messaggio,
// stesso stile del controllo "foreign key" già in uso per deleteSupplier.
const VAT_UNIQUE_INDEX = 'idx_suppliers_builder_vat'

function friendlyError(message: string): string {
  if (message.includes(VAT_UNIQUE_INDEX)) {
    return 'Partita IVA già usata da un altro fornitore di questo costruttore.'
  }
  return message
}

export async function createSupplierForBuilder(
  builderId: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }
  // builderId arriva dal client (prop della pagina, non da un input utente
  // libero): non fidarsi comunque, perché la RLS di suppliers (002_rls.sql:
  // 417-425) valida il builder tramite residence_id, MAI tramite la colonna
  // builder_id introdotta dalla 039. Senza questo controllo, un builder_id
  // arbitrario passerebbe la RLS finché residence_id appartiene al proprio
  // costruttore, scrivendo una riga con builder scoping falso. La verità è
  // sempre profile.builder_id, mai il parametro.
  if (!profile.builder_id || profile.builder_id !== builderId) {
    return { error: 'Permessi insufficienti' }
  }

  const name       = (formData.get('name') as string)?.trim()
  const phone      = (formData.get('phone') as string)?.trim() || null
  const email      = (formData.get('email') as string)?.trim() || null
  const vatNumber  = (formData.get('vat_number') as string)?.trim() || null
  const residenceId = (formData.get('residence_id') as string)?.trim() || ''

  if (!name) return { error: 'Nome fornitore obbligatorio' }
  if (!residenceId) return { error: 'Residenza obbligatoria' }

  const { error } = await supabase
    .from('suppliers')
    .insert({
      residence_id: residenceId,
      builder_id: profile.builder_id,
      name,
      phone,
      email,
      vat_number: vatNumber,
    })

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/admin/fornitori')
  return { success: true }
}

// Solo anagrafica: name/phone/email/vat_number. MAI residence_id (039:
// "residenza di prima creazione", non modificabile da qui) né builder_id
// (fisso dalla creazione) né categories (modello legacy, non scritto dal
// flusso builder-level). Il collegamento fornitore-residenza-sistema vive
// in supplier_installations, gestito da un commit separato.
export async function updateSupplierAnagrafica(
  supplierId: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }

  const name      = (formData.get('name') as string)?.trim()
  const phone     = (formData.get('phone') as string)?.trim() || null
  const email     = (formData.get('email') as string)?.trim() || null
  const vatNumber = (formData.get('vat_number') as string)?.trim() || null

  if (!name) return { error: 'Nome fornitore obbligatorio' }

  // Client RLS-scoped: "suppliers: super_admin gestisce" confina l'update
  // al builder del chiamante via residence_id del fornitore esistente,
  // invariato da questo update.
  const { error } = await supabase
    .from('suppliers')
    .update({ name, phone, email, vat_number: vatNumber })
    .eq('id', supplierId)

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/admin/fornitori')
  return { success: true }
}
