'use client'

import { useState, useTransition } from 'react'
import { Check, X, Edit2 } from 'lucide-react'
import { updateAccountProfile } from './actions'
import { Input, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function AccountTab({ initialName, email }: { initialName: string; email: string }) {
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)

  function handleSave() {
    const fd = new FormData()
    fd.set('full_name', name)
    startTransition(async () => {
      const res = await updateAccountProfile(fd)
      if (res.error) showToast('error', res.error)
      else {
        setSavedName(name)
        setEditing(false)
        showToast('success', 'Profilo salvato.')
      }
    })
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Profilo account</h2>
        {!editing && (
          <Button type="button" variant="ghost" size="default" onClick={() => setEditing(true)} className="gap-1.5">
            <Edit2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            Modifica
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          {editing ? (
            <>
              <Label htmlFor="account-name">Nome</Label>
              <Input
                id="account-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Il tuo nome"
              />
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium text-neutral-700 mb-2">Nome</p>
              <p className="text-sm font-medium text-neutral-900">{savedName || '—'}</p>
            </>
          )}
        </div>

        <div>
          <p className="text-[13px] font-medium text-neutral-700 mb-2">Email</p>
          <p className="text-sm text-neutral-900">{email}</p>
        </div>
      </div>

      {editing && (
        <div className="flex gap-2 pt-1">
          <Button type="button" onClick={handleSave} disabled={pending} className="gap-1.5">
            <Check className="w-4 h-4" strokeWidth={2} />
            Salva profilo
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-1.5"
            onClick={() => { setEditing(false); setName(savedName) }}
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
            Annulla
          </Button>
        </div>
      )}
    </section>
  )
}
