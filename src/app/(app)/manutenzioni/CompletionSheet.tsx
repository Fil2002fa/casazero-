'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Textarea, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { todayISO } from '@/lib/maintenance-status'
import { completeN2 } from './actions'

interface Props {
  open: boolean
  onClose: () => void
  itemId: string
  unitId: string
  residenceId: string
  title: string
  residenceName: string
  unitLabel: string
}

export function CompletionSheet({
  open, onClose, itemId, unitId, residenceId, title, residenceName, unitLabel,
}: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Una sola costante per la data: quella mostrata è la stessa che finisce nel
  // fascicolo. Ricalcolarla per il display la farebbe divergere dall'hidden field
  // (todayISO è UTC: in Italia prima delle 02:00 è ancora il giorno prima).
  const [completedAt] = useState(todayISO)
  const completedAtLabel = new Date(`${completedAt}T00:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await completeN2(formData)
      if (result?.error) {
        showToast('error', result.error)
      } else {
        formRef.current?.reset()
        onClose()
        showToast('success', 'Registrato nel fascicolo.')
        router.refresh()
      }
    })
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={<>Verrà registrato nel fascicolo di {residenceName} · {formatUnitLabel(unitLabel)}</>}
    >
      <form ref={formRef} action={handleSubmit} className="space-y-4">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="completedAt" value={completedAt} />

        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-background px-3 py-2.5">
          <span className="text-sm text-text-secondary">Data dell&apos;intervento</span>
          <span className="text-sm font-medium text-text-primary">{completedAtLabel}</span>
        </div>

        <div>
          <Label htmlFor="completion-notes">Note <span className="font-normal text-neutral-500">(facoltativo)</span></Label>
          <Textarea
            id="completion-notes"
            name="notes"
            rows={3}
            placeholder="Descrivi brevemente l'intervento…"
          />
        </div>

        <div>
          <Label htmlFor="completion-attachment">Allegato <span className="font-normal text-neutral-500">(facoltativo)</span></Label>
          <input
            id="completion-attachment"
            type="file"
            name="attachment"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="w-full text-sm text-neutral-500 file:mr-3 file:h-11 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
          />
        </div>

        <div className="space-y-2">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Registrazione in corso…' : 'Registra nel fascicolo'}
          </Button>
          <p className="text-xs leading-relaxed text-text-secondary text-center">
            L&apos;intervento resta registrato in modo permanente nel fascicolo dell&apos;immobile
            e accompagna la casa nel tempo.
          </p>
        </div>
      </form>
    </BottomSheet>
  )
}
