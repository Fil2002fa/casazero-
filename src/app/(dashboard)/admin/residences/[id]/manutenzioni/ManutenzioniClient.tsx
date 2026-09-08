'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Bell } from 'lucide-react'
import { MaintenanceBadge } from '@/components/MaintenanceBadge'
import { Select } from '@/components/ui/Input'
import { ItemConfigForm } from './ItemConfigForm'
import { setTemplateActivationForResidence } from '../fornitori/actions'
import { sollecitaItem, type SollecitoResult } from './actions'
import { isOverdueLive, isInCorso } from '@/lib/maintenance-status'
import type { MaintenancePriority, MaintenanceStatus, CompletionMode, ObligationType, ItemActivation } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { formatFrequency } from '@/lib/formatFrequency'
import { pluralize } from '@/lib/pluralize'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

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
  units: { label: string } | null
  suppliers: { id: string; name: string } | null
}

export type CompletionRow = {
  id: string
  completed_at: string
  item_id: string
  performed_by_name: string | null
  notes: string | null
  attachments: { id: string; file_name: string; storage_path: string }[]
}

export type FilterState = 'scaduta' | 'in_corso' | 'completate' | null
export type AttentionModeFilter = 'amministratore' | 'residente' | null

// Risoluzione assi: item override → template fallback. Unico call-site per testa e corpo,
// così non nascono calcoli paralleli divergenti. Refactor puro dei calcoli inline preesistenti.
function resolveAxes(item: ItemRow) {
  const tpl = item.maintenance_templates
  return {
    mode:       (item.completion_mode ?? tpl?.completion_mode) as CompletionMode,
    obligation: (item.obligation_type ?? tpl?.obligation_type) as ObligationType,
    priority:   (item.priority ?? tpl?.priority ?? 'N2') as MaintenancePriority,
  }
}

function daysOverdue(dateStr: string | null, today: Date): number {
  if (!dateStr) return 0
  return Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86400000)
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
  unitPrimaryNames: Record<string, string>
  initialFilter?: FilterState
  initialModeFilter?: AttentionModeFilter
  // Composizione del piano (Escludi/Includi) riservata al costruttore: obbligatoria,
  // senza default, così un chiamante che dimentica di passarla fallisce in build
  // invece di nascondere in silenzio i bottoni al super_admin.
  canManagePlan: boolean
}

// Azione di composizione piano in transito verso il modale di conferma (preview-before-apply).
type PendingAction = {
  templateId: string
  title: string
  targetStatus: 'inclusa' | 'archiviata'
  count: number
  freqMonths: number | null
}

// Sollecito in transito verso il modale di conferma — unico per superficie
// (zona attenzione: un item alla volta; UnitRow: un solo item per istanza).
type SollecitaConfirmState = {
  itemId: string
  title: string
  mode: CompletionMode
  unitLabel: string
  days: number
}

// Gate di visibilità del pulsante Sollecita, unica fonte per zona attenzione e
// UnitRow. isOverdueLive resta il gate di ritardo (commit 1, non si tocca):
// qui si aggiunge solo il gating di ruolo. Sugli item completion_mode
// 'amministratore' la action rifiuta con forbidden per il ruolo admin (il
// destinatario sarebbe l'admin stesso) — corretto lato server, ma in UI
// sarebbe un pulsante che fallisce sempre: va nascosto. canManagePlan
// (page.tsx:103) è esattamente `profile.role === 'super_admin'`: qui è il
// ruolo per cui la action non pone quel vincolo.
function sollecitaVisible(mode: CompletionMode, overdue: boolean, canManagePlan: boolean) {
  return overdue && mode !== 'promemoria' && (mode !== 'amministratore' || canManagePlan)
}

// Traduce l'esito di sollecitaItem in un messaggio toast. Unica fonte per zona
// attenzione e UnitRow: mai un assunto ottimistico, ogni esito il suo
// messaggio. Toast.tsx:8 ha solo kind 'success'/'error' — qui il colore segna
// se l'operazione ha raggiunto lo scopo, il testo distingue simulato da reale
// da già-sollecitato. Un esito parziale (alcuni destinatari raggiunti, altri
// no) resta 'success': non è un fallimento.
function sollecitoToast(result: SollecitoResult): { kind: 'success' | 'error'; message: string } {
  switch (result.status) {
    case 'ok': {
      const { sent, simulated, failed, withoutEmail, skipped } = result.outcome
      if (sent > 0) {
        return {
          kind: 'success',
          message: (failed > 0 || withoutEmail > 0)
            ? 'Sollecito inviato ad alcuni destinatari (altri non raggiunti).'
            : 'Sollecito inviato.',
        }
      }
      if (simulated > 0) {
        return {
          kind: 'success',
          message: 'Sollecito simulato: nessuna email è partita davvero (ambiente locale senza RESEND_API_KEY).',
        }
      }
      if (skipped > 0) {
        return { kind: 'success', message: 'Già sollecitato nelle ultime 24 ore.' }
      }
      // sent=simulated=skipped=0: destinatari c'erano, ma nessun invio è arrivato
      // (tutti falliti e/o senza email registrata).
      return { kind: 'error', message: 'Sollecito non riuscito: nessun destinatario raggiunto.' }
    }
    case 'no_recipients':
      return { kind: 'success', message: 'Nessun destinatario configurato per questa voce.' }
    case 'not_solicitable':
    case 'not_overdue':
      // Il gate sollecitaVisible tiene il pulsante nascosto in condizioni normali:
      // qui solo se lo stato è cambiato tra render e click (race).
      return { kind: 'error', message: 'Non è più possibile sollecitare questa voce: aggiorna la pagina.' }
    case 'forbidden':
      return { kind: 'error', message: 'Non hai i permessi per sollecitare questa voce.' }
    case 'error':
      // result.message è il testo grezzo del provider: resta in console, mai nel toast.
      console.error('[sollecitaItem]', result.message)
      return { kind: 'error', message: 'Si è verificato un errore. Riprova più tardi.' }
  }
}

// Testo del modale di conferma Sollecita: unica fonte per zona attenzione e
// UnitRow. Il destinatario si deduce solo dal completion_mode (mai risolto ad
// account/nome — quello resta nel toast a invio concluso). mode qui non è mai
// 'promemoria': il gate sollecitaVisible lo esclude a monte.
function sollecitaConfirmCopy(mode: CompletionMode, unitLabel: string, title: string, days: number): { title: string; body: string } {
  const recipient = mode === 'residente' ? `il residente di ${unitLabel}` : "l'amministratore della residenza"
  return {
    title: 'Invia sollecito',
    body: `Stai per inviare un sollecito a ${recipient} per "${title}", in ritardo da ${pluralize(days, 'giorno', 'giorni')}.`,
  }
}

export function ManutenzioniClient({ residenceId, residenceName, items, completions, suppliers, unitPrimaryNames, initialFilter = null, initialModeFilter = null, canManagePlan }: Props) {
  const { showToast } = useToast()
  // Un item per volta: Set di id in corso, cosi' il disabled riguarda solo il
  // pulsante cliccato e non l'intera zona attenzione.
  const [pendingSollecitoIds, setPendingSollecitoIds] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterState>(initialFilter)
  const modeFilter = initialModeFilter
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [expandedCompletion, setExpandedCompletion] = useState<string | null>(null)
  const [planView, setPlanView] = useState<'attive' | 'escluse'>('attive')
  // La vista Escluse è composizione del piano, riservata al costruttore: se lo stato
  // finisse su 'escluse' per qualunque via (oggi nessuna, ma niente lo garantisce in
  // futuro — es. un parametro URL), l'admin va forzato su 'attive' invece di atterrare
  // su una schermata senza selettore per uscirne.
  const effectivePlanView = canManagePlan ? planView : 'attive'
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const [sollecitaConfirm, setSollecitaConfirm] = useState<SollecitaConfirmState | null>(null)

  const today = new Date()

  const sollecitaCopy = sollecitaConfirm
    ? sollecitaConfirmCopy(sollecitaConfirm.mode, sollecitaConfirm.unitLabel, sollecitaConfirm.title, sollecitaConfirm.days)
    : null
  const sollecitaBusy = sollecitaConfirm ? pendingSollecitoIds.has(sollecitaConfirm.itemId) : false

  function handleConfirm() {
    if (!pendingAction) return
    const { templateId, targetStatus } = pendingAction
    startTransition(async () => {
      const res = await setTemplateActivationForResidence(templateId, residenceId, targetStatus)
      if (!res.error) setPendingAction(null)
    })
  }

  async function handleSollecita(itemId: string) {
    if (pendingSollecitoIds.has(itemId)) return
    setPendingSollecitoIds(prev => new Set(prev).add(itemId))
    try {
      const result = await sollecitaItem(itemId)
      const { kind, message } = sollecitoToast(result)
      showToast(kind, message)
    } finally {
      setPendingSollecitoIds(prev => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  // Gli item archiviati spariscono dal piano attivo; le loro completion restano nel fascicolo
  const liveItems = items.filter(i => i.activation_status !== 'archiviata')

  // Contatori dalle sorgenti canoniche (invariati: liveItems e yearCompletions)
  const scaduteCount = liveItems.filter(i => isOverdueLive(i)).length
  const inCorsoCount = liveItems.filter(i => isInCorso(i)).length
  const years = [...new Set(completions.map(c => Number(c.completed_at.slice(0, 4))))].sort((a, b) => b - a)
  const yearCompletions = completions.filter(c => Number(c.completed_at.slice(0, 4)) === selectedYear)
  const completedCount = yearCompletions.length

  function toggleFilter(f: FilterState) {
    setActiveFilter(prev => (prev === f ? null : f))
  }

  // Opzioni del select-unità: derivate una volta da liveItems (mai da filteredItems),
  // così restano tutte le unità anche quando il piano è filtrato.
  const unitOptions = (() => {
    const seen = new Map<string, string>()
    for (const i of liveItems) {
      if (i.unit_id && i.units && !seen.has(i.unit_id)) seen.set(i.unit_id, i.units.label)
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => compareUnitLabels(a.label, b.label))
  })()

  // Filtro-unità come drill-down: gli item scope=condominio (unit_id null) restano sempre visibili.
  const filteredItems = selectedUnitId
    ? liveItems.filter(i => i.unit_id === selectedUnitId || i.unit_id === null)
    : liveItems

  // TESTA — zona attenzione (per-istanza). Guardia promemoria strutturale: N1 non scade mai.
  const allAttentionItems = filteredItems
    .filter(i => {
      const mode = resolveAxes(i).mode
      return (isOverdueLive(i) || isInCorso(i)) && mode !== 'promemoria' && (modeFilter === null || mode === modeFilter)
    })
    .sort((a, b) => {
      const aOverdue = isOverdueLive(a)
      const bOverdue = isOverdueLive(b)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      if (aOverdue) {
        const da = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity
        const db = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity
        return da - db // più in ritardo (data più vecchia) prima
      }
      return 0
    })

  // CORPO — piano per tipo, raggruppato per categoria (esterno) → titolo template (interno).
  const byTemplate = new Map<string, Map<string, ItemRow[]>>()
  for (const item of filteredItems) {
    const cat = item.maintenance_templates?.category ?? 'Altro'
    const title = item.maintenance_templates?.title ?? 'Senza titolo'
    if (!byTemplate.has(cat)) byTemplate.set(cat, new Map())
    const inner = byTemplate.get(cat)!
    if (!inner.has(title)) inner.set(title, [])
    inner.get(title)!.push(item)
  }

  // Filtro Scadute/In corso: mostra solo i tipi con almeno un'istanza in quello stato
  // (guardia promemoria). Il drill-down mostra comunque TUTTE le istanze del tipo.
  let displayTemplate: Map<string, Map<string, ItemRow[]>>
  if (activeFilter === null || activeFilter === 'completate') {
    displayTemplate = activeFilter === 'completate' ? new Map() : byTemplate
  } else {
    const status = activeFilter
    const matchesFilter = status === 'scaduta' ? isOverdueLive : isInCorso
    displayTemplate = new Map()
    for (const [cat, inner] of byTemplate) {
      const keptInner = new Map<string, ItemRow[]>()
      for (const [title, typeItems] of inner) {
        const hasMatch = typeItems.some(i => matchesFilter(i) && resolveAxes(i).mode !== 'promemoria')
        if (hasMatch) keptInner.set(title, typeItems)
      }
      if (keptInner.size > 0) displayTemplate.set(cat, keptInner)
    }
  }

  // Tipi interamente esclusi dal piano: costruiti da `items` RAW (liveItems li nasconde).
  // Un tipo entra qui solo se OGNI sua istanza è archiviata; i tipi misti restano nel piano.
  const excludedTemplates = (() => {
    const groups = new Map<string, ItemRow[]>()
    for (const i of items) {
      if (!groups.has(i.template_id)) groups.set(i.template_id, [])
      groups.get(i.template_id)!.push(i)
    }
    const result: { templateId: string; title: string; category: string; count: number; freq: number | null }[] = []
    for (const [templateId, group] of groups) {
      if (group.every(i => i.activation_status === 'archiviata')) {
        const rep = group[0]
        result.push({
          templateId,
          title: rep.maintenance_templates?.title ?? 'Senza titolo',
          category: rep.maintenance_templates?.category ?? 'Altro',
          count: group.length,
          freq: rep.frequency_months ?? rep.maintenance_templates?.frequency_months ?? null,
        })
      }
    }
    return result.sort((a, b) =>
      a.category.localeCompare(b.category, 'it') || a.title.localeCompare(b.title, 'it'))
  })()

  // Mappa completamenti per categoria (fascicolo, invariata — lookup su items RAW)
  const completionsByCategory = new Map<string, { completion: CompletionRow; item: ItemRow }[]>()
  if (activeFilter === 'completate') {
    for (const c of yearCompletions) {
      const item = items.find(i => i.id === c.item_id)
      if (!item) continue
      const cat = item.maintenance_templates?.category ?? 'Altro'
      if (!completionsByCategory.has(cat)) completionsByCategory.set(cat, [])
      completionsByCategory.get(cat)!.push({ completion: c, item })
    }
  }

  return (
    <div className="space-y-5">
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
      <>
      {/* Card-contatore cliccabili */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => toggleFilter('scaduta')}
          className={`rounded-xl p-3 text-center border transition-all ${
            activeFilter === 'scaduta'
              ? 'bg-semantic-red-bg border-semantic-red/40 ring-2 ring-semantic-red/20'
              : scaduteCount > 0
              ? 'bg-semantic-red-bg border-semantic-red/20'
              : 'bg-surface border-border'
          }`}
        >
          <p className={`text-xl font-medium ${scaduteCount > 0 ? 'text-semantic-red' : 'text-text-primary'}`}>
            {scaduteCount}
          </p>
          <p className="text-[10px] text-text-secondary">Scadute</p>
        </button>

        <button
          onClick={() => toggleFilter('in_corso')}
          className={`rounded-xl p-3 text-center border transition-all ${
            activeFilter === 'in_corso'
              ? 'bg-semantic-amber-bg border-semantic-amber/40 ring-2 ring-semantic-amber/20'
              : inCorsoCount > 0
              ? 'bg-semantic-amber-bg border-semantic-amber/20'
              : 'bg-surface border-border'
          }`}
        >
          <p className={`text-xl font-medium ${inCorsoCount > 0 ? 'text-semantic-amber' : 'text-text-primary'}`}>
            {inCorsoCount}
          </p>
          <p className="text-[10px] text-text-secondary">In corso</p>
        </button>

        <button
          onClick={() => toggleFilter('completate')}
          className={`rounded-xl p-3 text-center border transition-all ${
            activeFilter === 'completate'
              ? 'bg-brand-light border-brand-medium/40 ring-2 ring-brand-medium/20'
              : 'bg-surface border-border'
          }`}
        >
          <p className={`text-xl font-medium ${activeFilter === 'completate' ? 'text-brand-dark' : 'text-text-primary'}`}>
            {completedCount}
          </p>
          <p className="text-[10px] text-text-secondary">Completate</p>
        </button>
      </div>

      {/* Selettore anni — visibile solo con filtro Completate */}
      {activeFilter === 'completate' && years.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedYear === year
                  ? 'bg-brand-dark text-white'
                  : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Lista completamenti (filtro Completate) — fascicolo invariato */}
      {activeFilter === 'completate' && (
        completionsByCategory.size === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">
              Nessun intervento completato nel {selectedYear}.
            </p>
          </div>
        ) : (
          Array.from(completionsByCategory.entries()).map(([cat, entries]) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-sm font-medium text-text-primary">{cat}</h2>
              <div className="space-y-2">
                {entries.map(({ completion, item }) => {
                  const tpl = item.maintenance_templates
                  const { mode: effMode, obligation: effObl } = resolveAxes(item)
                  const dateStr = new Date(completion.completed_at).toLocaleDateString('it-IT', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                  const hasDetail = !!completion.notes || completion.attachments?.length > 0
                  const isExpanded = expandedCompletion === completion.id

                  const header = (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text-primary truncate">{tpl?.title}</p>
                        <MaintenanceBadge mode={effMode} obligation={effObl} status="completata" />
                      </div>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {item.units && (
                          <span className="text-xs text-text-secondary">{formatUnitLabel(item.units.label)}</span>
                        )}
                        <span className="text-xs text-brand-medium font-medium">
                          Completata il {dateStr}
                        </span>
                        {completion.performed_by_name && (
                          <span className="text-xs text-text-secondary">· {completion.performed_by_name}</span>
                        )}
                      </div>
                    </div>
                  )

                  if (!hasDetail) {
                    return (
                      <div key={completion.id} className="bg-surface rounded-xl border border-border p-3">
                        {header}
                      </div>
                    )
                  }

                  return (
                    <div key={completion.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                      <button
                        onClick={() => setExpandedCompletion(isExpanded ? null : completion.id)}
                        className="w-full p-3 flex items-center gap-3 text-left"
                      >
                        {header}
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
                          : <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border p-3 space-y-2">
                          {completion.notes && (
                            <p className="text-sm text-text-secondary leading-relaxed">{completion.notes}</p>
                          )}
                          {completion.attachments?.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {completion.attachments.map(att => (
                                <a
                                  key={att.id}
                                  href={`/api/download?bucket=attachments&path=${encodeURIComponent(att.storage_path)}`}
                                  className="text-xs text-brand-medium underline"
                                >
                                  {att.file_name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )
      )}

      {/* Select filtro-unità (drill-down secondario) */}
      {activeFilter !== 'completate' && unitOptions.length > 0 && (
        <Select
          value={selectedUnitId ?? ''}
          onChange={e => { setSelectedUnitId(e.target.value || null); setExpandedTemplate(null) }}
        >
          <option value="">Tutte le unità</option>
          {unitOptions.map(u => (
            <option key={u.id} value={u.id}>{formatUnitLabel(u.label)}</option>
          ))}
        </Select>
      )}

      {/* TESTA — zona attenzione (per-istanza) */}
      {activeFilter !== 'completate' && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-primary">
            {allAttentionItems.length === 0
              ? 'Tutto in regola'
              : `${allAttentionItems.length} ${allAttentionItems.length === 1 ? 'intervento richiede' : 'interventi richiedono'} attenzione`}
          </h2>
          {allAttentionItems.length === 0 ? (
            <div className="bg-brand-light rounded-xl p-4 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-medium flex-shrink-0" />
              <p className="text-sm text-brand-dark">Nessun intervento in ritardo.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allAttentionItems.map(item => {
                const tpl = item.maintenance_templates
                const { mode: effMode, obligation: effObl } = resolveAxes(item)
                const unitLabel = item.unit_id === null
                  ? 'Condominio'
                  : (item.units ? formatUnitLabel(item.units.label) : '—')
                const overdueNow = isOverdueLive(item)
                const accent = overdueNow ? 'border-l-semantic-red' : 'border-l-semantic-amber'
                const badgeStatus = overdueNow ? 'scaduta' : item.status
                const n = daysOverdue(item.next_due_date, today)
                return (
                  <div key={item.id} className={`bg-surface rounded-xl border border-border border-l-4 ${accent} p-3`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text-primary truncate">{tpl?.title}</p>
                      <MaintenanceBadge mode={effMode} obligation={effObl} status={badgeStatus} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-text-secondary">{unitLabel}</span>
                      {overdueNow ? (
                        <span className="text-xs text-semantic-red">
                          in ritardo da {n} {n === 1 ? 'giorno' : 'giorni'}
                        </span>
                      ) : (
                        <span className="text-xs text-semantic-amber">in corso</span>
                      )}
                      {sollecitaVisible(effMode, overdueNow, canManagePlan) && (
                        <Button
                          variant="secondary"
                          size="table"
                          className="ml-auto gap-1.5 px-2.5 text-xs"
                          onClick={() => setSollecitaConfirm({ itemId: item.id, title: tpl?.title ?? '', mode: effMode, unitLabel, days: n })}
                        >
                          <Bell className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.6} />
                          Sollecita
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* CORPO — piano per tipo (categoria → righe-tipo → drill-down unità) */}
      {activeFilter !== 'completate' && (
        displayTemplate.size === 0 && activeFilter !== null ? (
          <div className="bg-surface rounded-xl border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">
              Nessuna voce {activeFilter === 'scaduta' ? 'scaduta' : 'in corso'}.
            </p>
          </div>
        ) : (
          Array.from(displayTemplate.entries()).map(([cat, inner]) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-sm font-medium text-text-primary">{cat}</h2>
              <div className="space-y-2">
                {Array.from(inner.entries()).map(([title, typeItems]) => {
                  const rep = typeItems[0]
                  const { mode, obligation } = resolveAxes(rep)
                  const isCondominio = typeItems.every(i => i.unit_id === null)
                  const inRitardo = typeItems.filter(
                    i => (isOverdueLive(i) || isInCorso(i)) && resolveAxes(i).mode !== 'promemoria'
                  ).length
                  const freq = rep.frequency_months ?? rep.maintenance_templates?.frequency_months
                  const key = `${cat}__${title}`
                  const isExpanded = expandedTemplate === key

                  return (
                    <div key={title} className="bg-surface rounded-xl border border-border overflow-hidden">
                      <button
                        onClick={() => setExpandedTemplate(isExpanded ? null : key)}
                        className="w-full p-3 flex items-center gap-3 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-text-primary truncate">{title}</p>
                            <MaintenanceBadge mode={mode} obligation={obligation} status="in_attesa" />
                          </div>
                          <div className="flex gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-text-secondary">
                              {isCondominio ? 'Condominio' : `${typeItems.length} unità`}
                            </span>
                            <span className="text-xs text-text-secondary">{formatFrequency(freq)}</span>
                            {inRitardo > 0 && (
                              <span className="text-xs text-semantic-red font-medium">{inRitardo} in ritardo</span>
                            )}
                          </div>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
                          : <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border">
                          {canManagePlan && (
                            <div className="px-3 py-2 bg-background flex justify-end">
                              <button
                                onClick={() => setPendingAction({
                                  templateId: rep.template_id,
                                  title,
                                  targetStatus: 'archiviata',
                                  count: typeItems.length,
                                  freqMonths: freq ?? null,
                                })}
                                className="text-xs text-semantic-red font-medium px-2 py-1 rounded-md hover:bg-semantic-red-bg transition-colors"
                              >
                                Escludi dal piano
                              </button>
                            </div>
                          )}
                          {isCondominio ? (
                            <UnitRow
                              item={rep}
                              label="Condominio"
                              residenceId={residenceId}
                              suppliers={suppliers}
                              primaryName={null}
                              canManagePlan={canManagePlan}
                            />
                          ) : (
                            typeItems.map(item => (
                              <UnitRow
                                key={item.id}
                                item={item}
                                label={item.units ? formatUnitLabel(item.units.label) : '—'}
                                residenceId={residenceId}
                                suppliers={suppliers}
                                primaryName={item.unit_id ? unitPrimaryNames[item.unit_id] ?? null : null}
                                canManagePlan={canManagePlan}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )
      )}

      </>
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

      {/* Modale di conferma (preview-before-apply): dichiara righe toccate ed effetto */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!isPending) setPendingAction(null) }}
        >
          <div
            className="bg-surface rounded-xl border border-border max-w-sm w-full p-5 space-y-3"
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
                    Le scadenze verranno ricalcolate a partire da oggi
                    {pendingAction.freqMonths ? ` (+ ${pendingAction.freqMonths} mesi)` : ''}.
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

      {/* Modale di conferma Sollecita: il testo dichiara CHI riceve, non "sei sicuro?" */}
      {sollecitaConfirm && sollecitaCopy && (
        <Modal
          open
          onClose={() => { if (!sollecitaBusy) setSollecitaConfirm(null) }}
          title={sollecitaCopy.title}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={sollecitaBusy}
                onClick={() => setSollecitaConfirm(null)}
              >
                Annulla
              </Button>
              <Button
                variant="primary"
                disabled={sollecitaBusy}
                onClick={async () => {
                  await handleSollecita(sollecitaConfirm.itemId)
                  setSollecitaConfirm(null)
                }}
              >
                {sollecitaBusy ? 'Invio…' : 'Invia sollecito'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-primary">{sollecitaCopy.body}</p>
        </Modal>
      )}
    </div>
  )
}

// Riga-unità nel drill-down: dettaglio per-istanza + Configura (ItemConfigForm) invariata.
function UnitRow({ item, label, residenceId, suppliers, primaryName, canManagePlan }: {
  item: ItemRow
  label: string
  residenceId: string
  suppliers: { id: string; name: string }[]
  primaryName: string | null
  canManagePlan: boolean
}) {
  const { showToast } = useToast()
  const tpl = item.maintenance_templates
  const { mode: effMode, obligation: effObl } = resolveAxes(item)
  const formattedDue = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const [isPending, setIsPending] = useState(false)
  // Stato live, mai il campo status salvato: il cron non gira in locale e in
  // produzione lascia buchi tra un run e l'altro. isOverdueLive esclude gia'
  // item archiviati (isCountable), promemoria e presa in carico ('in_corso'):
  // il sollecito vale solo sul ritardo effettivo.
  const overdue = isOverdueLive(item)
  const canSollecitare = sollecitaVisible(effMode, overdue, canManagePlan)
  // Stesso predicato del badge in zona attenzione (riga 475): la label sotto
  // e il badge qui devono concordare, mai uno "Scaduta" rosso accanto a un
  // badge ancora "Pianificata".
  const badgeStatus = overdue ? 'scaduta' : item.status
  const [sollecitaConfirmOpen, setSollecitaConfirmOpen] = useState(false)
  const sollecitaCopy = sollecitaConfirmOpen
    ? sollecitaConfirmCopy(effMode, label, tpl?.title ?? '', daysOverdue(item.next_due_date, new Date()))
    : null

  async function handleSollecita() {
    if (isPending) return
    setIsPending(true)
    try {
      const result = await sollecitaItem(item.id)
      const { kind, message } = sollecitoToast(result)
      showToast(kind, message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-primary">
            {label}{primaryName ? ` · ${primaryName}` : ''}
          </span>
          <MaintenanceBadge mode={effMode} obligation={effObl} status={badgeStatus} size="xs" />
        </div>
        <div className="flex gap-3 mt-1 flex-wrap">
          {effMode === 'promemoria' ? (
            <span className="text-xs text-semantic-blue">
              Promemoria · {formatFrequency(item.frequency_months ?? tpl?.frequency_months)}
            </span>
          ) : formattedDue ? (
            <span className={`text-xs ${overdue ? 'text-semantic-red' : 'text-text-secondary'}`}>
              {overdue ? 'Scaduta ' : 'Scade '}{formattedDue}
            </span>
          ) : null}
          {item.suppliers && (
            <span className="text-xs text-brand-medium">{item.suppliers.name}</span>
          )}
          {canSollecitare && (
            <button
              onClick={() => setSollecitaConfirmOpen(true)}
              className="flex items-center gap-1 text-xs text-brand-dark font-medium px-2 py-1 rounded-md hover:bg-brand-light transition-colors"
            >
              <Bell className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.6} />
              Sollecita
            </button>
          )}
        </div>
      </div>
      <ItemConfigForm
        itemId={item.id}
        residenceId={residenceId}
        currentMode={effMode}
        currentObligation={effObl}
        currentFrequency={item.frequency_months ?? tpl?.frequency_months ?? null}
        currentWarranty={item.warranty_info}
        currentSupplierId={item.supplier_id}
        suppliers={suppliers}
      />

      {/* Modale di conferma Sollecita: il testo dichiara CHI riceve, non "sei sicuro?" */}
      {sollecitaConfirmOpen && sollecitaCopy && (
        <Modal
          open
          onClose={() => { if (!isPending) setSollecitaConfirmOpen(false) }}
          title={sollecitaCopy.title}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => setSollecitaConfirmOpen(false)}
              >
                Annulla
              </Button>
              <Button
                variant="primary"
                disabled={isPending}
                onClick={async () => {
                  await handleSollecita()
                  setSollecitaConfirmOpen(false)
                }}
              >
                {isPending ? 'Invio…' : 'Invia sollecito'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-primary">{sollecitaCopy.body}</p>
        </Modal>
      )}
    </div>
  )
}
