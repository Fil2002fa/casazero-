'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { CompletionMode, ObligationType } from '@/types/database'

function modeToPriority(mode: CompletionMode | null): string | null {
  if (mode === null) return null
  const map: Record<CompletionMode, string> = {
    promemoria:     'N1',
    residente:      'N2',
    amministratore: 'N3',
  }
  return map[mode]
}

function priorityToMode(priority: string | null): CompletionMode | null {
  if (priority === null) return null
  const map: Record<string, CompletionMode> = {
    N1: 'promemoria',
    N2: 'residente',
    N3: 'amministratore',
  }
  return map[priority] ?? null
}

export async function createSupplier(
  residenceId: string,
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

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: 'Permessi insufficienti' }
  }

  const name  = (formData.get('name') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const email = (formData.get('email') as string)?.trim() || null
  const categoriesRaw = (formData.get('categories') as string)?.trim() || ''
  const categories = categoriesRaw.split(',').map(c => c.trim()).filter(Boolean)

  if (!name) return { error: 'Nome fornitore obbligatorio' }

  const { error } = await supabase
    .from('suppliers')
    .insert({ residence_id: residenceId, name, phone, email, categories })

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/fornitori`)
  return { success: true }
}

export async function deleteSupplier(
  supplierId: string,
  residenceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', supplierId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/fornitori`)
  return {}
}

export async function updateMaintenanceItemConfig(
  itemId: string,
  residenceId: string,
  data: {
    frequency_months?: number | null
    priority?: string | null
    completion_mode?: CompletionMode | null
    obligation_type?: ObligationType | null
    warranty_info?: string | null
    supplier_id?: string | null
  }
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: 'Permessi insufficienti' }
  }

  const updatePayload: Record<string, unknown> = { ...data }

  // Dual-write: completion_mode e priority restano sincronizzati durante la transizione.
  // completion_mode ha precedenza (form nuovo); se arriva solo priority (form legacy)
  // si deriva completion_mode. obligation_type è additivo puro: già nello spread se presente.
  if (data.completion_mode !== undefined) {
    updatePayload.completion_mode = data.completion_mode
    updatePayload.priority = modeToPriority(data.completion_mode)
  } else if (data.priority !== undefined) {
    updatePayload.priority = data.priority
    updatePayload.completion_mode = priorityToMode(data.priority)
  }

  // Un item promemoria (priority=N1) non può mai risultare scaduto per design.
  // Il guard legge la priority effettiva nel payload (già aggiornata dal dual-write),
  // così scatta sia su "arriva completion_mode=promemoria" sia su "arriva priority=N1".
  const effectivePriority = updatePayload.priority as string | null | undefined
  if (effectivePriority === 'N1') {
    let freq = data.frequency_months ?? null
    if (!freq) {
      const { data: itemRow } = await supabase
        .from('maintenance_items')
        .select('frequency_months, maintenance_templates(frequency_months)')
        .eq('id', itemId)
        .single()
      const tpl = itemRow?.maintenance_templates as unknown as { frequency_months: number } | null
      freq = itemRow?.frequency_months ?? tpl?.frequency_months ?? null
    }
    updatePayload.status = 'in_attesa'
    if (freq) {
      const nextDue = new Date()
      nextDue.setMonth(nextDue.getMonth() + freq)
      updatePayload.next_due_date = nextDue.toISOString().split('T')[0]
    }
  }

  const { error } = await supabase
    .from('maintenance_items')
    .update(updatePayload)
    .eq('id', itemId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/manutenzioni`)
  return { success: true }
}
