'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CompletionSheet } from './CompletionSheet'

interface Props {
  itemId: string
  unitId: string
  residenceId: string
  title: string
}

export function CompletionAction({ itemId, unitId, residenceId, title }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        Registra completamento
      </Button>
      <CompletionSheet
        open={open}
        onClose={() => setOpen(false)}
        itemId={itemId}
        unitId={unitId}
        residenceId={residenceId}
        title={title}
      />
    </>
  )
}
