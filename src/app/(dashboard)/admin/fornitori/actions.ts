'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { SISTEMI, type Sistema } from '@/lib/document-classification'
import { friendlySupplierError } from '@/lib/supplier-errors'

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

  if (error) return { error: friendlySupplierError(error.message) }

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

  if (error) return { error: friendlySupplierError(error.message) }

  revalidatePath('/admin/fornitori')
  return { success: true }
}

// Collegamento manuale fornitore-residenza-sistema. source='manuale' e
// source_document_id=NULL sono i default di colonna della 039: qui non c'è
// nessun documento sorgente, un valore esplicito diverso è impossibile da
// questo form. Il match verso i due membri della RLS (039: "supplier_
// installations: super_admin gestisce") è delegato interamente al DB —
// supplier_id e residence_id arrivano dal client (select popolate dalla
// pagina), ma un valore fuori dal builder del chiamante fa fallire il
// WITH CHECK, non serve un controllo applicativo aggiuntivo come per
// suppliers.builder_id (qui non c'è una colonna builder_id da falsificare).
export async function addSupplierInstallation(
  supplierId: string,
  residenceId: string,
  sistema: string
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

  if (!supplierId || !residenceId) return { error: 'Residenza e sistema obbligatori' }
  if (!SISTEMI.includes(sistema as Sistema)) return { error: 'Sistema non valido' }

  const { error } = await supabase
    .from('supplier_installations')
    .insert({
      supplier_id: supplierId,
      residence_id: residenceId,
      sistema,
      source: 'manuale',
    })

  if (error) return { error: friendlySupplierError(error.message) }

  revalidatePath('/admin/fornitori')
  return { success: true }
}

// Cancella solo la riga di collegamento, mai il fornitore: nessuna FK da
// supplier_installations verso maintenance_items o completions, quindi non
// serve un messaggio di "collegato altrove" come per deleteSupplier.
export async function removeSupplierInstallation(
  installationId: string
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

  const { error } = await supabase
    .from('supplier_installations')
    .delete()
    .eq('id', installationId)

  if (error) return { error: error.message }

  revalidatePath('/admin/fornitori')
  return { success: true }
}
