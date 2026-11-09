'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logActivityEvent } from '@/lib/activity-log'
import type { CompletionMode } from '@/types/database'
import { SISTEMI, type Sistema } from '@/lib/document-classification'
import { nextDueFrom } from '@/lib/maintenance-due'
import { resolveCompletionMode, resolveFrequencyMonths, todayISO } from '@/lib/maintenance-status'
import { unitNotDelivered } from '@/lib/unit-utils'

// Crea il fornitore E la riga "ha realizzato" nella stessa azione: la select
// del sistema sostituisce l'input categories, quindi ha già il dato per
// scrivere subito supplier_installations. Senza questo, un fornitore creato
// da qui non avrebbe alcun collegamento (il problema diagnosticato per i
// fornitori pre-esistenti si ripresenterebbe su ogni dato nuovo).
//
// builder_id: bug pre-esistente scoperto qui, non introdotto da questo
// commit — dopo la 039 la colonna è NOT NULL, ma questa INSERT non l'ha mai
// valorizzata. Da quando la 039 è stata applicata, questa azione falliva
// sempre con una violazione NOT NULL, mai osservata perché ogni test post-039
// ha creato fornitori solo dalla pagina builder. Corretto qui perché è la
// stessa riga di INSERT che si sta comunque toccando per il sistema.
//
// Non transazionale: supabase-js su REST non espone una transazione
// multi-statement. Se il secondo INSERT fallisce, il fornitore resta creato
// senza collegamento — uno stato incompleto ma mai corrotto (nessun record
// a metà, nessun dato inconsistente): riappare in "Nessun lavoro collegato"
// e si può ricollegare a mano dalla pagina builder.
export async function createSupplier(
  residenceId: string,
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
  if (!profile.builder_id) return { error: 'Nessun builder associato al tuo account' }

  const name    = (formData.get('name') as string)?.trim()
  const phone   = (formData.get('phone') as string)?.trim() || null
  const email   = (formData.get('email') as string)?.trim() || null
  const sistema = (formData.get('sistema') as string) ?? ''

  if (!name) return { error: 'Nome fornitore obbligatorio' }
  if (!SISTEMI.includes(sistema as Sistema)) return { error: 'Sistema non valido' }

  const { data: inserted, error } = await supabase
    .from('suppliers')
    .insert({ residence_id: residenceId, builder_id: profile.builder_id, name, phone, email })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const { error: installError } = await supabase
    .from('supplier_installations')
    .insert({ supplier_id: inserted.id, residence_id: residenceId, sistema, source: 'manuale' })

  if (installError) return { error: installError.message }

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', supplierId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/fornitori`)
  return {}
}

// Fan-out a livello residenza: include o esclude dal piano attivo TUTTE le istanze di un
// tipo (template) in un colpo. Tocca solo `activation_status` (per-istanza); MAI `is_active`
// (template globale) e MAI `completions`. Solo super_admin. Usa il client RLS: la policy
// "items: super_admin gestisce tutto" (FOR ALL) copre l'UPDATE multi-riga.
export async function setTemplateActivationForResidence(
  templateId: string,
  residenceId: string,
  targetStatus: 'inclusa' | 'archiviata'
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // full_name entra nella select perché il registro attività congela il nome
  // dell'attore al momento dell'atto (activity-log.ts:44-58).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  // Composizione del piano: azione riservata al costruttore, non all'amministratore.
  if (profile?.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }

  // Esclusione: archivia le istanze attive. Nessun tocco a status/next_due_date.
  if (targetStatus === 'archiviata') {
    const { data, error } = await supabase
      .from('maintenance_items')
      .update({ activation_status: 'archiviata' })
      .eq('template_id', templateId)
      .eq('residence_id', residenceId)
      .neq('activation_status', 'archiviata')
      .select('id')

    if (error) return { error: error.message }

    const itemIds = (data ?? []).map(row => row.id as string)

    // Un evento per ATTO, non per istanza (037_activity_events.sql:48-52):
    // unit_id resta null perché l'archiviazione tocca istanze di più unità, e
    // il numero di voci toccate va nel payload. Condizionato a count > 0 come
    // il sollecito (manutenzioni/actions.ts:232): il .neq qui sopra rende una
    // seconda conferma a zero righe, e zero righe non sono un atto. La tabella
    // è append-only, quindi una riga "archiviata" senza nulla di archiviato
    // resterebbe falsa per sempre.
    if (itemIds.length > 0) {
      const svc = createServiceClient()

      // Il titolo non è in scope in questa action (la UI lo ha già dal piano):
      // letto qui apposta per il registro, con il service client per non
      // dipendere dalla visibilità RLS del template. Se la lettura fallisce
      // il titolo resta null e la riga si scrive lo stesso: il registro non
      // deve mai bloccare un atto già compiuto.
      const { data: template, error: templateError } = await svc
        .from('maintenance_templates')
        .select('title')
        .eq('id', templateId)
        .maybeSingle()
      if (templateError) console.error('setTemplateActivationForResidence: errore lettura titolo template', { templateId, templateError })

      await logActivityEvent(svc, {
        residenceId,
        unitId: null,
        eventType: 'voce_archiviata',
        // Attore dalla sessione, mai da input: il service client bypassa le
        // policy INSERT della 037, l'antispoofing vive in questa riga.
        actorId: user.id,
        actorRole: profile.role,
        actorName: profile.full_name ?? null,
        payload: {
          template_id: templateId,
          title: template?.title ?? null,
          count: itemIds.length,
          item_ids: itemIds,
        },
      })
    }

    revalidatePath(`/admin/residences/${residenceId}/manutenzioni`)
    return { count: itemIds.length }
  }

  // Inclusione: riattiva le istanze archiviate e ricalcola le scadenze da oggi,
  // per TUTTE le modalità (estensione del guard N1). Il ricalcolo per-riga con
  // fallback freq (item ?? template) non è esprimibile in un singolo UPDATE literal:
  // si raggruppa per scadenza risultante (bucket) e si emette un UPDATE per bucket —
  // un solo statement nel caso comune (nessun override per-item, es. FV).
  //
  // Cancello di consegna (stessa regola di 044 e resolveDueBasis): una voce di
  // unità non consegnata, non promemoria, torna senza data — il piano dell'unità
  // parte solo dalla registrazione della consegna. La base NON passa alla data
  // di consegna per le unità consegnate: resta oggi, altrimenti una voce
  // re-inclusa potrebbe nascere già scaduta. Le promemoria restano datate.
  const { data: affected, error: fetchError } = await supabase
    .from('maintenance_items')
    .select('id, unit_id, frequency_months, completion_mode, maintenance_templates(frequency_months, completion_mode), units(delivery_date)')
    .eq('template_id', templateId)
    .eq('residence_id', residenceId)
    .eq('activation_status', 'archiviata')

  if (fetchError) return { error: fetchError.message }
  if (!affected || affected.length === 0) {
    revalidatePath(`/admin/residences/${residenceId}/manutenzioni`)
    return { count: 0 }
  }

  const today = todayISO()
  // Chiave = scadenza da scrivere. 'invariata': frequenza assente, next_due_date
  // non si tocca (comportamento precedente). 'nessuna': cancello di consegna.
  const buckets = new Map<string, { nextDue: string | null | undefined; ids: string[] }>()
  for (const row of affected) {
    const tpl = row.maintenance_templates as unknown as
      { frequency_months: number; completion_mode: CompletionMode | null } | null
    const unit = row.units as unknown as { delivery_date: string | null } | null
    const item = {
      completion_mode: row.completion_mode as CompletionMode | null,
      frequency_months: row.frequency_months,
      maintenance_templates: tpl,
    }
    const freq = resolveFrequencyMonths(item)
    const gated =
      row.unit_id !== null &&
      unitNotDelivered(unit?.delivery_date ?? null) &&
      resolveCompletionMode(item) !== 'promemoria'
    const nextDue = gated ? null : freq ? nextDueFrom(today, freq) : undefined
    const key = nextDue === undefined ? 'invariata' : nextDue === null ? 'nessuna' : nextDue
    if (!buckets.has(key)) buckets.set(key, { nextDue, ids: [] })
    buckets.get(key)!.ids.push(row.id)
  }

  let total = 0
  for (const { nextDue, ids } of buckets.values()) {
    const payload: Record<string, unknown> = {
      activation_status: 'inclusa',
      status: 'in_attesa',
    }
    if (nextDue !== undefined) {
      payload.next_due_date = nextDue
    }
    const { data, error } = await supabase
      .from('maintenance_items')
      .update(payload)
      .in('id', ids)
      .select('id')

    if (error) return { error: error.message }
    total += data?.length ?? 0
  }

  revalidatePath(`/admin/residences/${residenceId}/manutenzioni`)
  return { count: total }
}
