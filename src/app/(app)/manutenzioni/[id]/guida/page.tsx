import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { resolveCompletionMode, type LiveStatusItem } from '@/lib/maintenance-status'
import { isResidentGuideAvailable } from '../../guide-eligibility'
import { GuideExperience } from './GuideExperience'
import { resolveMaintenanceIllustrations } from '../../maintenance-illustrations'
import { getResidentGuideContent } from './guide-content'

export const metadata: Metadata = { title: 'Guida manutenzione' }

type Params = Promise<{ id: string }>

export default async function ResidentMaintenanceGuidePage({ params }: { params: Params }) {
  const { id } = await params
  const profile = await requireProfile()
  if (profile.role !== 'client') notFound()

  const supabase = await createClient()
  const { data: item, error: itemError } = await supabase
    .from('maintenance_items')
    .select('id, template_id, unit_id, residence_id, completion_mode, activation_status, maintenance_templates!inner(completion_mode, is_active, scope)')
    .eq('id', id)
    .maybeSingle()

  if (itemError) {
    console.error('[manutenzione-guida] Errore lettura voce', { itemId: id, error: itemError })
    return <div className="space-y-4 px-5 pt-4"><Link href={`/manutenzioni/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-dark"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Torna al dettaglio</Link><p role="alert" className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">Non è stato possibile caricare la guida. Riprova ricaricando la pagina.</p></div>
  }
  if (!item) notFound()

  const { data: membership, error: membershipError } = await supabase
    .from('unit_members')
    .select('unit_id, units(residence_id)')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()

  if (membershipError) {
    console.error('[manutenzione-guida] Errore lettura membership', { itemId: id, error: membershipError })
    return <div className="space-y-4 px-5 pt-4"><Link href={`/manutenzioni/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-dark"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Torna al dettaglio</Link><p role="alert" className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">Non è stato possibile verificare la tua unità. Riprova ricaricando la pagina.</p></div>
  }

  const template = item.maintenance_templates as unknown as {
    completion_mode: 'residente' | 'amministratore' | 'promemoria' | null
    is_active: boolean
    scope: string
  } | null
  const membershipUnit = membership?.units as unknown as { residence_id: string } | null
  const liveItem = item as unknown as LiveStatusItem
  const eligible = isResidentGuideAvailable({
    templateId: item.template_id,
    isClient: profile.role === 'client',
    isOwnUnit: Boolean(item.unit_id && membership?.unit_id === item.unit_id),
    isApartmentItem: item.unit_id !== null,
    isCommonItem: item.unit_id === null && template?.scope === 'condominium',
    isOwnResidence: Boolean(membership?.unit_id && membershipUnit?.residence_id === item.residence_id),
    completionMode: resolveCompletionMode(liveItem),
    activationStatus: item.activation_status,
    templateActive: template?.is_active === true,
  })
  const guideContent = getResidentGuideContent(item.template_id)
  if (!eligible || !template || !guideContent) notFound()

  const illustrations = resolveMaintenanceIllustrations(item.template_id)

  return <GuideExperience content={guideContent} stepIllustrations={illustrations?.steps} detailHref={`/manutenzioni/${id}`} />
}
