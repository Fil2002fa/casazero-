'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CompletionSheet } from './CompletionSheet'

interface Props {
  itemId: string
  unitId: string
  residenceId: string
  title: string
  residenceName: string
  unitLabel: string
}

export function CompletionAction({ itemId, unitId, residenceId, title, residenceName, unitLabel }: Props) {
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
        residenceName={residenceName}
        unitLabel={unitLabel}
      />
    </>
  )
}
