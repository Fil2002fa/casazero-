'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Textarea, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { completeN2 } from './actions'

interface Props {
  open: boolean
  onClose: () => void
  itemId: string
  unitId: string
  residenceId: string
  title: string
}

export function CompletionSheet({ open, onClose, itemId, unitId, residenceId, title }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await completeN2(formData)
      if (result?.error) {
        showToast('error', result.error)
      } else {
        formRef.current?.reset()
        onClose()
        showToast('success', 'Completamento registrato.')
        router.refresh()
      }
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <form ref={formRef} action={handleSubmit} className="space-y-4">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="completedAt" value={new Date().toISOString().split('T')[0]} />

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

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Salvataggio in corso…' : 'Registra completamento'}
        </Button>
      </form>
    </BottomSheet>
  )
}
