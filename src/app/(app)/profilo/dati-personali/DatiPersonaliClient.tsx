'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { updateResidentProfile } from '../actions'
import styles from '../profilo.module.css'

export function DatiPersonaliClient({ fullName, phone, email, embedded = false, onSaved, onCancel, onSavingChange }: {
  fullName: string | null
  phone: string | null
  email: string
  embedded?: boolean
  onSaved?: (name: string) => void
  onCancel?: () => void
  onSavingChange?: (saving: boolean) => void
}) {
  const router = useRouter()
  const [savedName, setSavedName] = useState(fullName ?? '')
  const [name, setName] = useState(fullName ?? '')
  const [editing, setEditing] = useState(embedded)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    onSavingChange?.(true)
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
      onSaved?.(result.fullName)
    } catch {
      setError('Impossibile salvare il nome. Riprova.')
    } finally {
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  return (
    <section className={embedded ? styles.personalForm : 'bg-surface rounded-xl border border-border p-4 space-y-4'}>
      <form onSubmit={save} className="space-y-4" aria-busy={saving}>
        <div>
          {editing ? <>
            <Label htmlFor="resident-name">Nome e cognome</Label>
            <Input id="resident-name" className={styles.nameInput} autoComplete="name" autoFocus={!embedded} required minLength={2} maxLength={100} value={name} disabled={saving} error={!!error} aria-describedby={error ? 'name-error' : 'name-help'} onChange={event => setName(event.target.value)} />
            <p id="name-help" className={styles.fieldCaption}>Puoi modificare il tuo nome. Gli altri dati sono mostrati in sola lettura.</p>
          </> : <>
            <p className="text-xs text-text-secondary mb-1">Nome e cognome</p>
            <p className="text-base text-text-primary break-words">{savedName || 'Non impostato'}</p>
          </>}
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">Telefono</p>
          <p className={embedded ? styles.readonly : 'text-base text-text-primary break-words'}>{phone || 'Non impostato'}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">Email</p>
          <p className={embedded ? styles.readonly : 'text-base text-text-primary break-all'}>{email || 'Non impostata'}</p>
        </div>
        {error && <p id="name-error" role="alert" className="text-sm text-status-overdue">{error}</p>}
        <p role="status" className="text-sm text-text-secondary">{success ? 'Dati personali salvati.' : saving ? 'Salvataggio…' : ''}</p>
        {editing ? <div className="space-y-2">
          <Button type="submit" disabled={saving} className="w-full min-h-11">{saving ? 'Salvataggio…' : 'Salva modifiche'}</Button>
          <Button type="button" variant={embedded ? 'secondary' : 'ghost'} disabled={saving} className="w-full min-h-11" onClick={() => {
            setName(savedName)
            setEditing(false)
            setError('')
            setSuccess(false)
            onCancel?.()
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
