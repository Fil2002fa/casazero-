'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { FieldError, FieldHelp, Label, Select, Textarea } from '@/components/ui/Input'
import { SidePanel } from '@/components/ui/SidePanel'
import { useToast } from '@/components/ui/Toast'
import { COMPLETION_MODES, isCompletionMode } from '@/lib/completion-mode'
import {
  buildConfigChanges, MIXED_VALUE, planConfigWrite, WARRANTY_MAX_LENGTH,
  type ConfigDraft, type ConfigItem, type ConfigRow,
} from '@/lib/maintenance-config'
import { MODE_LABELS, OBLIGATION_LABELS } from '@/lib/maintenance-labels'
import { pluralize } from '@/lib/pluralize'
import { configureVoce } from './actions'

// Pannello Configura di una voce (3a). Cosa: obbligo in sola lettura (D1) e
// info garanzia. Chi e dove: chi la chiude e fornitore. Un solo Salva, che
// scrive su tutte le unità della voce. Regole, piano e anteprima vengono da
// maintenance-config.ts (verify:maintconfig); la scrittura è configureVoce.
//
// Un campo diverso tra le unità parte su "Valori diversi tra le unità": è un
// segnaposto, mai un valore. Se l'utente non lo cambia, il campo non entra nel
// payload e nessuna riga viene toccata per quel campo.
//
// Montare con key={templateId}: la bozza riparte da zero a ogni voce.

type Props = {
  row: ConfigRow
  /** Tutte le istanze della voce, archiviate comprese (D4). */
  items: readonly ConfigItem[]
  suppliers: readonly { id: string; name: string }[]
  residenceId: string
  /** Data di oggi (ISO) del server: stessa per l'anteprima e per la scrittura. */
  today: string
  onClose: () => void
}

const MIXED_LABEL = 'Valori diversi tra le unità'
const NONE_VALUE = ''

export function ConfigurePanel({ row, items, suppliers, residenceId, today, onClose }: Props) {
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [mode, setMode] = useState<ConfigDraft['completion_mode']>(
    row.mode.kind === 'uniform' ? row.mode.value : MIXED_VALUE)
  const [supplier, setSupplier] = useState<ConfigDraft['supplier_id']>(
    row.supplier.kind === 'uniform' ? row.supplier.value : MIXED_VALUE)
  const [warranty, setWarranty] = useState<ConfigDraft['warranty_info']>(
    row.warranty.kind === 'uniform' ? (row.warranty.value ?? '') : MIXED_VALUE)

  const changes = useMemo(
    () => buildConfigChanges(row, { completion_mode: mode, supplier_id: supplier, warranty_info: warranty }),
    [row, mode, supplier, warranty],
  )
  const hasChanges = Object.keys(changes).length > 0
  const { summary } = useMemo(() => planConfigWrite(items, changes, today), [items, changes, today])

  // D5: le parti comuni non hanno un residente da avvisare.
  const modeOptions = COMPLETION_MODES.filter(m => m !== 'residente' || row.scope === 'unit')
  const where = row.scope === 'common' ? 'sulle parti comuni' : `su ${pluralize(summary.touched, 'unità', 'unità')}`

  function edit(apply: () => void) {
    apply()
    setConfirming(false)
    setError(null)
  }

  function save() {
    if (!hasChanges || isPending) return
    if (summary.needsConfirm && !confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const res = await configureVoce(residenceId, row.templateId, changes)
      if (res.ok) {
        showToast('success', 'Configurazione salvata.')
        onClose()
      } else {
        setError(res.message)
        setConfirming(false)
      }
    })
  }

  return (
    <SidePanel
      open
      onClose={onClose}
      titleId="voce-configure-title"
      title={row.title}
      subtitle={`${row.category} · Configura per voce`}
      footer={
        <div className="flex gap-2">
          {confirming && (
            <Button variant="secondary" disabled={isPending} onClick={() => setConfirming(false)}>Indietro</Button>
          )}
          <Button variant="primary" className="flex-1" disabled={!hasChanges || isPending} onClick={save}>
            {isPending ? 'Salvo…' : confirming ? 'Conferma e salva' : 'Salva'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Cosa</h3>
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-secondary">Obbligo</p>
            <p className="text-sm text-text-primary">
              {row.obligation.kind === 'uniform' && row.obligation.value !== null
                ? OBLIGATION_LABELS[row.obligation.value]
                : row.obligation.kind === 'mixed' ? MIXED_LABEL : '—'}
            </p>
            <FieldHelp>Fatto normativo del catalogo: non si modifica da qui.</FieldHelp>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cfg-warranty">Info garanzia</Label>
            <Textarea
              id="cfg-warranty"
              value={warranty === MIXED_VALUE ? '' : warranty ?? ''}
              placeholder={warranty === MIXED_VALUE ? MIXED_LABEL : 'Es. 2 anni dalla posa'}
              maxLength={WARRANTY_MAX_LENGTH}
              onChange={e => edit(() => setWarranty(e.target.value))}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Chi e dove</h3>
          <div className="space-y-1">
            <Label htmlFor="cfg-mode">Chi la chiude</Label>
            <Select
              id="cfg-mode"
              value={mode ?? MIXED_VALUE}
              onChange={e => edit(() => setMode(isCompletionMode(e.target.value) ? e.target.value : MIXED_VALUE))}
            >
              {mode === MIXED_VALUE && <option value={MIXED_VALUE}>{MIXED_LABEL}</option>}
              {modeOptions.map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cfg-supplier">Fornitore</Label>
            <Select
              id="cfg-supplier"
              value={supplier === MIXED_VALUE ? MIXED_VALUE : supplier ?? NONE_VALUE}
              onChange={e => edit(() => setSupplier(
                e.target.value === MIXED_VALUE ? MIXED_VALUE : e.target.value === NONE_VALUE ? null : e.target.value))}
            >
              {supplier === MIXED_VALUE && <option value={MIXED_VALUE}>{MIXED_LABEL}</option>}
              <option value={NONE_VALUE}>— nessuno —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </section>

        {hasChanges && (
          <p className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand-dark">
            {changes.completion_mode !== undefined
              ? `Cambi chi la chiude ${where}.`
              : `Salvi le modifiche ${where}.`}
          </p>
        )}

        {confirming && (
          <div className="space-y-1 rounded-lg border border-border bg-background px-3 py-3 text-sm text-text-primary" role="status">
            <p className="font-medium">Questa modifica tocca date o stato:</p>
            <ul className="list-disc space-y-0.5 pl-5 text-text-secondary">
              {summary.toPromemoria > 0 && <li>{pluralize(summary.toPromemoria, 'voce diventa', 'voci diventano')} promemoria.</li>}
              {summary.datesReset > 0 && <li>{pluralize(summary.datesReset, 'data ripartirà', 'date ripartiranno')} da oggi + frequenza.</li>}
              {summary.backToAwaitingDelivery > 0 && <li>{pluralize(summary.backToAwaitingDelivery, 'unità torna', 'unità tornano')} in attesa di consegna.</li>}
              {summary.overdueNow > 0 && <li>{pluralize(summary.overdueNow, 'risulta scaduta', 'risultano scadute')} subito.</li>}
              <li>Le date future restano com’erano.</li>
            </ul>
          </div>
        )}

        {error !== null && <FieldError>{error}</FieldError>}
      </div>
    </SidePanel>
  )
}
