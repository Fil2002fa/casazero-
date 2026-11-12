'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { updateResidentProfile } from '../actions'

export function DatiPersonaliClient({ fullName, phone, email }: { fullName: string | null; phone: string | null; email: string }) {
  const router = useRouter()
  const [savedName, setSavedName] = useState(fullName ?? '')
  const [name, setName] = useState(fullName ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const result = await updateResidentProfile({ fullName: name })
      if (result.error || result.fullName === undefined) {
        setError(result.error ?? 'Impossibile salvare il nome. Riprova.')
        return
      }
      setSavedName(result.fullName)
      setName(result.fullName)
      setEditing(false)
      setSuccess(true)
      router.refresh()
    } catch {
      setError('Impossibile salvare il nome. Riprova.')
    } finally { setSaving(false) }
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
      <form onSubmit={save} className="space-y-4" aria-busy={saving}>
        <div>
          {editing ? <>
            <Label htmlFor="resident-name">Nome e cognome</Label>
            <Input id="resident-name" autoComplete="name" autoFocus required minLength={2} maxLength={100} value={name} disabled={saving} error={!!error} aria-describedby={error ? 'name-error' : undefined} onChange={event => setName(event.target.value)} />
          </> : <>
            <p className="text-xs text-text-secondary mb-1">Nome e cognome</p>
            <p className="text-base text-text-primary break-words">{savedName || 'Non impostato'}</p>
          </>}
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">Telefono</p>
          <p className="text-base text-text-primary break-words">{phone || 'Non impostato'}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">Email</p>
          <p className="text-base text-text-primary break-all">{email || 'Non impostata'}</p>
        </div>
        {error && <p id="name-error" role="alert" className="text-sm text-semantic-red">{error}</p>}
        <p role="status" className="text-sm text-text-secondary">{success ? 'Dati personali salvati.' : saving ? 'Salvataggio…' : ''}</p>
        {editing ? <div className="space-y-2">
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Salvataggio…' : 'Salva modifiche'}</Button>
          <Button type="button" variant="ghost" disabled={saving} className="w-full" onClick={() => {
            setName(savedName)
            setEditing(false)
            setError('')
            setSuccess(false)
          }}>Annulla</Button>
        </div> : <Button type="button" className="w-full" onClick={() => {
          setName(savedName)
          setEditing(true)
          setSuccess(false)
          setError('')
        }}>Modifica dati personali</Button>}
      </form>
    </section>
  )
}
