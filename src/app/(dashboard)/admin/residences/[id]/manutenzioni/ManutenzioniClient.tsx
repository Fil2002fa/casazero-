'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { MaintenanceList } from './MaintenanceList'
import { MaintenanceDetailPanel } from './MaintenanceDetailPanel'
import { buildVoceDetail } from '@/lib/maintenance-detail'
import { setTemplateActivationForResidence } from '../fornitori/actions'
import { resolveCompletionMode } from '@/lib/maintenance-status'
import { unitNotDelivered } from '@/lib/unit-utils'
import type { MaintenancePriority, MaintenanceStatus, CompletionMode, ObligationType, ItemActivation } from '@/types/database'
import { pluralize } from '@/lib/pluralize'

export type ItemRow = {
  id: string
  template_id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  priority: MaintenancePriority | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
  frequency_months: number | null
  warranty_info: string | null
  supplier_id: string | null
  maintenance_templates: {
    title: string
    category: string
    priority: MaintenancePriority
    completion_mode: CompletionMode
    obligation_type: ObligationType
    frequency_months: number
    scope: string
    is_active: boolean
  } | null
  units: { label: string; delivery_date: string | null } | null
  suppliers: { id: string; name: string; phone: string | null; email: string | null } | null
}

export type CompletionRow = {
  id: string
  completed_at: string
  item_id: string
  performed_by_name: string | null
  notes: string | null
  attachments: { id: string; file_name: string; storage_path: string }[]
}

// Natural sort delle label unità: le label senza numero (nomi custom, es. "Appartamento
// Rossi") vanno prima in ordine alfabetico; le "Unità N" numerate seguono in ordine crescente.
function compareUnitLabels(a: string, b: string): number {
  const na = a.match(/\d+/)
  const nb = b.match(/\d+/)
  if (na && nb) {
    const diff = parseInt(na[0], 10) - parseInt(nb[0], 10)
    return diff !== 0 ? diff : a.localeCompare(b, 'it')
  }
  if (na) return 1  // solo a numerata → dopo
  if (nb) return -1 // solo b numerata → a (alfabetica) prima
  return a.localeCompare(b, 'it')
}

interface Props {
  residenceId: string
  residenceName: string
  items: ItemRow[]
  completions: CompletionRow[]
  suppliers: { id: string; name: string }[]
  // Composizione del piano (Escludi/Includi) riservata al costruttore: obbligatoria,
  // senza default, così un chiamante che dimentica di passarla fallisce in build
  // invece di nascondere in silenzio i bottoni al super_admin.
  canManagePlan: boolean
  // Data di oggi (ISO) calcolata dal server, per la lista per voce: stessa
  // data in server render e client, niente mismatch di hydration.
  today: string
}

// Azione di composizione piano in transito verso il modale di conferma (preview-before-apply).
type PendingAction = {
  templateId: string
  title: string
  targetStatus: 'inclusa' | 'archiviata'
  count: number
  freqMonths: number | null
  // Solo inclusione: il tipo ha voci di unità non consegnate e non promemoria,
  // che la re-inclusione lascia senza data (cancello di consegna).
  hasUndeliveredUnitItems: boolean
}

export function ManutenzioniClient({ residenceId, residenceName, items, completions, canManagePlan, today: todayServer }: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  // Voce aperta nel pannello di dettaglio (lista per voce).
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [planView, setPlanView] = useState<'attive' | 'escluse'>('attive')
  // La vista Escluse è composizione del piano, riservata al costruttore: se lo stato
  // finisse su 'escluse' per qualunque via, l'admin va forzato su 'attive' invece di
  // atterrare su una schermata senza selettore per uscirne.
  const effectivePlanView = canManagePlan ? planView : 'attive'
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isPending, startTransition] = useTransition()

  // Pannello di dettaglio: la voce intera (mai filtrata dal filtro-unità, che ne
  // evidenzia solo la riga). I fornitori li vede solo chi compone il piano.
  const detail = useMemo(
    () => selectedTemplateId === null
      ? null
      : buildVoceDetail(selectedTemplateId, items, completions, todayServer, {
          highlightUnitId: selectedUnitId,
          showSuppliers: canManagePlan,
        }),
    [selectedTemplateId, items, completions, todayServer, selectedUnitId, canManagePlan],
  )
  // Identità stabile: useDialogFocus la mette nelle dipendenze dell'effetto.
  const closeDetail = useCallback(() => setSelectedTemplateId(null), [])

  function handleConfirm() {
    if (!pendingAction) return
    const { templateId, targetStatus } = pendingAction
    startTransition(async () => {
      const res = await setTemplateActivationForResidence(templateId, residenceId, targetStatus)
      if (!res.error) setPendingAction(null)
    })
  }

  // Gli item archiviati spariscono dal piano attivo; le loro completion restano nel fascicolo
  const liveItems = items.filter(i => i.activation_status !== 'archiviata')

  // Opzioni del select-unità: derivate una volta da liveItems, così restano tutte
  // le unità anche quando il piano è filtrato.
  const unitOptions = (() => {
    const seen = new Map<string, string>()
    for (const i of liveItems) {
      if (i.unit_id && i.units && !seen.has(i.unit_id)) seen.set(i.unit_id, i.units.label)
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => compareUnitLabels(a.label, b.label))
  })()

  // Tipi interamente esclusi dal piano: costruiti da `items` RAW (liveItems li nasconde).
  // Un tipo entra qui solo se OGNI sua istanza è archiviata; i tipi misti restano nel piano.
  const excludedTemplates = (() => {
    const groups = new Map<string, ItemRow[]>()
    for (const i of items) {
      if (!groups.has(i.template_id)) groups.set(i.template_id, [])
      groups.get(i.template_id)!.push(i)
    }
    const result: {
      templateId: string; title: string; category: string; count: number; freq: number | null
      hasUndeliveredUnitItems: boolean
    }[] = []
    for (const [templateId, group] of groups) {
      if (group.every(i => i.activation_status === 'archiviata')) {
        const rep = group[0]
        result.push({
          templateId,
          title: rep.maintenance_templates?.title ?? 'Senza titolo',
          category: rep.maintenance_templates?.category ?? 'Altro',
          count: group.length,
          freq: rep.frequency_months ?? rep.maintenance_templates?.frequency_months ?? null,
          // Stessa regola del cancello in setTemplateActivationForResidence.
          hasUndeliveredUnitItems: group.some(i =>
            i.unit_id !== null &&
            unitNotDelivered(i.units?.delivery_date ?? null) &&
            resolveCompletionMode(i) !== 'promemoria'),
        })
      }
    }
    return result.sort((a, b) =>
      a.category.localeCompare(b.category, 'it') || a.title.localeCompare(b.title, 'it'))
  })()

  return (
    <div className="space-y-6">
      {/* Segmented control: piano attivo vs tipi esclusi — solo per chi può comporre il piano */}
      {canManagePlan && (
        <div className="flex rounded-lg border border-border p-0.5 bg-surface">
          <button
            onClick={() => setPlanView('attive')}
            aria-pressed={planView === 'attive'}
            className={`flex-1 h-11 md:h-9 rounded-md text-sm font-medium text-text-primary transition-colors ${
              planView === 'attive' ? 'bg-background shadow-sm' : ''
            }`}
          >
            Attive
          </button>
          <button
            onClick={() => setPlanView('escluse')}
            aria-pressed={planView === 'escluse'}
            className={`flex-1 h-11 md:h-9 rounded-md text-sm font-medium text-text-primary transition-colors ${
              planView === 'escluse' ? 'bg-background shadow-sm' : ''
            }`}
          >
            Escluse{excludedTemplates.length > 0 ? ` (${excludedTemplates.length})` : ''}
          </button>
        </div>
      )}

      {effectivePlanView === 'attive' && (
        <MaintenanceList
          items={items}
          completions={completions}
          today={todayServer}
          unitOptions={unitOptions}
          selectedUnitId={selectedUnitId}
          onSelectUnit={setSelectedUnitId}
          onOpen={setSelectedTemplateId}
        />
      )}

      {/* Vista Escluse — tipi interamente archiviati, sorgente per la reinclusione */}
      {effectivePlanView === 'escluse' && (
        <section className="space-y-2">
          {excludedTemplates.length === 0 ? (
            <div className="bg-surface rounded-xl border border-border p-6 text-center">
              <p className="text-sm text-text-secondary">Nessun tipo escluso dal piano.</p>
            </div>
          ) : (
            excludedTemplates.map(t => (
              <div key={t.templateId} className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-text-secondary">{t.category}</span>
                    <span className="text-xs text-text-secondary">
                      {t.count} {t.count === 1 ? 'istanza' : 'istanze'}
                    </span>
                  </div>
                </div>
                {canManagePlan && (
                  <button
                    onClick={() => setPendingAction({
                      templateId: t.templateId,
                      title: t.title,
                      targetStatus: 'inclusa',
                      count: t.count,
                      freqMonths: t.freq,
                      hasUndeliveredUnitItems: t.hasUndeliveredUnitItems,
                    })}
                    className="text-xs text-brand-dark font-medium px-3 py-1.5 rounded-md bg-brand-light hover:brightness-95 transition-all flex-shrink-0"
                  >
                    Includi nel piano
                  </button>
                )}
              </div>
            ))
          )}
        </section>
      )}

      <MaintenanceDetailPanel detail={detail} onClose={closeDetail} />

      {/* Modale di conferma (preview-before-apply): dichiara righe toccate ed effetto */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!isPending) setPendingAction(null) }}
        >
          <div
            className="bg-surface rounded-xl border border-border max-w-sm w-full p-6 space-y-3 break-words"
            onClick={e => e.stopPropagation()}
          >
            {pendingAction.targetStatus === 'inclusa' ? (
              <>
                <h3 className="text-base font-medium text-text-primary">Includi nel piano</h3>
                <div className="space-y-2 text-sm text-text-primary">
                  <p>
                    Stai includendo <span className="font-medium">{pendingAction.title}</span> nel
                    piano attivo di <span className="font-medium">{residenceName}</span>.
                  </p>
                  <p className="text-text-secondary">
                    {pendingAction.count} {pendingAction.count === 1 ? 'istanza verrà riattivata' : 'istanze verranno riattivate'}.
                  </p>
                  <p className="text-text-secondary">
                    Le scadenze ripartiranno da oggi
                    {pendingAction.freqMonths ? ` (+ ${pluralize(pendingAction.freqMonths, 'mese', 'mesi')})` : ''}.
                    {pendingAction.hasUndeliveredUnitItems &&
                      ' Le voci delle unità non ancora consegnate partiranno dalla data di consegna.'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-medium text-text-primary">Escludi dal piano</h3>
                <div className="space-y-2 text-sm text-text-primary">
                  <p>
                    Stai escludendo <span className="font-medium">{pendingAction.title}</span> dal piano attivo.
                  </p>
                  <p className="text-text-secondary">
                    {pendingAction.count} {pendingAction.count === 1 ? 'istanza verrà archiviata' : 'istanze verranno archiviate'}.
                    Lo storico (fascicolo) resta intatto.
                  </p>
                </div>
              </>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPendingAction(null)}
                disabled={isPending}
                className="flex-1 py-2 rounded-md text-sm font-medium border border-border text-text-secondary disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className={`flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 ${
                  pendingAction.targetStatus === 'inclusa' ? 'bg-brand-dark' : 'bg-semantic-red'
                }`}
              >
                {isPending
                  ? '…'
                  : `${pendingAction.targetStatus === 'inclusa' ? 'Includi' : 'Escludi'} ${pendingAction.count} ${pendingAction.count === 1 ? 'istanza' : 'istanze'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
