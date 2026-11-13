'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import Image from 'next/image'
import { Check, Copy, UserPlus, LogOut, Lock, Info, UserRound, ChevronRight } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createFamilyInvite, revokeFamilyInvite, updateNotificationPrefs } from './actions'
import { signOut } from '@/app/auth/actions'
import type { NotificationPrefs } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { MaintenanceHeader } from '../manutenzioni/MaintenanceHeader'
import { DatiPersonaliClient } from './dati-personali/DatiPersonaliClient'
import styles from './profilo.module.css'

type InviteRow = { id: string; token: string; expires_at: string; qrCode: string }
type MemberRow = { profile_id: string; full_name: string | null }
type Sheet = { kind: 'personal' | 'logout' } | { kind: 'invite' | 'revoke'; token: string }

const PREF_ROWS: { label: string; description: string; emailKey: 'email_reminders' | 'email_n3_status' }[] = [
  { label: 'Manutenzioni consigliate', description: 'Suggerimenti utili per la cura della casa.', emailKey: 'email_reminders' },
  { label: 'Manutenzioni condominiali', description: 'Aggiornamenti sulle manutenzioni delle parti comuni.', emailKey: 'email_n3_status' },
]

function initials(name: string | null) {
  return name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
}

function expiryDate(value: string) {
  return new Date(value).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })
}

export function ProfiloClient({ fullName, phone, email, unit, members, invites, appUrl, notifPrefs }: {
  fullName: string | null
  phone: string | null
  email: string
  unit: { id: string; label: string; residence_id: string; residence_name: string; address: string | null } | null
  members: MemberRow[]
  invites: InviteRow[]
  appUrl: string
  notifPrefs: NotificationPrefs
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<NotificationPrefs>(notifPrefs)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [prefSaved, setPrefSaved] = useState(false)
  const [prefError, setPrefError] = useState<string | null>(null)
  const inviteBusy = useRef(false)
  const prefBusy = useRef(false)
  const profileBusy = useRef(false)
  const focusAfterRevoke = useRef(false)
  const generateButton = useRef<HTMLButtonElement>(null)
  const sheetBody = useRef<HTMLDivElement>(null)
  const selectedInvite = sheet && 'token' in sheet ? invites.find(invite => invite.token === sheet.token) : undefined
  const selectedToken = sheet && 'token' in sheet ? sheet.token : ''
  const inviteUrl = `${appUrl}/welcome/${selectedToken}`
  const closeSheet = useCallback(() => {
    if (inviteBusy.current || profileBusy.current) return
    setSheet(null)
    setInviteError(null)
  }, [])

  // La conferma sostituisce il dettaglio nella stessa sheet, senza dialoghi annidati.
  useEffect(() => {
    if (sheet?.kind === 'revoke') sheetBody.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [sheet?.kind])

  useEffect(() => {
    if (focusAfterRevoke.current && !sheet && !pending) {
      generateButton.current?.focus()
      focusAfterRevoke.current = false
    }
  }, [sheet, pending])

  function openInvite(token: string) {
    setInviteError(null)
    setCopiedToken(null)
    setSheet({ kind: 'invite', token })
  }

  function handleGenerateInvite() {
    if (!unit || inviteBusy.current || invites.length >= 5) return
    inviteBusy.current = true
    setInviteError(null)
    startTransition(async () => {
      try {
        const result = await createFamilyInvite(unit.id)
        if (result.error || !result.token) {
          setInviteError(result.error ?? 'Impossibile generare l’invito. Riprova.')
          return
        }
        openInvite(result.token)
        router.refresh()
        showToast('success', 'Invito familiare generato.')
      } catch {
        setInviteError('Impossibile generare l’invito. Riprova.')
      } finally { inviteBusy.current = false }
    })
  }

  function handleRevokeInvite() {
    if (!unit || !selectedInvite || inviteBusy.current) return
    inviteBusy.current = true
    setInviteError(null)
    startTransition(async () => {
      try {
        const result = await revokeFamilyInvite(selectedInvite.id, unit.id)
        if (result.error) {
          setInviteError(result.error)
          return
        }
        focusAfterRevoke.current = true
        setSheet(null)
        router.refresh()
        showToast('success', 'Invito revocato.')
      } catch {
        setInviteError('Impossibile revocare l’invito. Riprova.')
      } finally { inviteBusy.current = false }
    })
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedToken(selectedToken)
      showToast('success', 'Link copiato.')
    } catch { setInviteError('Impossibile copiare il link. Puoi selezionarlo e copiarlo manualmente.') }
  }

  async function handleTogglePref(key: 'email_reminders' | 'email_n3_status') {
    if (prefBusy.current) return
    prefBusy.current = true
    const previous = prefs
    const next = { ...previous, [key]: !previous[key] }
    setPrefs(next)
    setPrefError(null)
    setSavingKey(key)
    setPrefSaved(false)
    try {
      const result = await updateNotificationPrefs(next)
      if (result.error) {
        setPrefs(previous)
        setPrefError(result.error)
      } else setPrefSaved(true)
    } catch {
      setPrefs(previous)
      setPrefError('Impossibile salvare le preferenze. Riprova.')
    } finally {
      setSavingKey(null)
      prefBusy.current = false
    }
  }

  const title = sheet?.kind === 'personal' ? 'Dati personali'
    : sheet?.kind === 'revoke' ? 'Revocare l’invito?'
    : sheet?.kind === 'logout' ? 'Uscire dall’account?' : 'Invito familiare'

  return (
    <div className={styles.page}>
      <MaintenanceHeader residenceName={unit?.residence_name || 'Nessuna abitazione associata'} unitLabel={unit?.label ?? ''} />
      <div className={styles.view}>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>Il tuo spazio</p>
          <h1 className={styles.title}>Area personale.</h1>
          <p className={styles.lead}>Gestisci il tuo account, gli accessi alla tua abitazione e le comunicazioni che ricevi.</p>
        </header>

        <section className={styles.section} aria-labelledby="account-title">
          <h2 id="account-title" className={styles.sectionTitle}>Il tuo account</h2>
          <div className={styles.surface}>
            <button type="button" className={styles.accountButton} aria-label="Apri dati personali" aria-haspopup="dialog" onClick={() => setSheet({ kind: 'personal' })}>
              <span className={styles.avatar} aria-hidden="true">{initials(fullName)}</span>
              <span className={styles.grow}><span className={styles.personName}>{fullName || 'Nome non impostato'}</span><span className={styles.personSub}>{email || 'Email non impostata'}</span></span>
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </button>
            <button type="button" className={styles.accountFooter} aria-haspopup="dialog" onClick={() => setSheet({ kind: 'personal' })}>
              <UserRound size={16} aria-hidden="true" /><span className={styles.grow}>Visualizza e modifica i dati personali</span><ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="home-title">
          <h2 id="home-title" className={styles.sectionTitle}>La tua abitazione</h2>
          <div className={`${styles.surface} ${styles.homeCard}`}>
            {unit ? <>
              <p className={styles.label}>Residenza</p><p className={styles.homeName}>{unit.residence_name || 'Residenza non disponibile'}</p>
              <p className={styles.homeAddress}>{unit.address || 'Indirizzo non disponibile'}</p>
              <hr className={styles.divider} />
              <p className={styles.label}>Il tuo appartamento</p><p className={styles.homeUnit}>{formatUnitLabel(unit.label)}</p>
            </> : <p className={styles.hint}>Nessuna abitazione associata al tuo account.</p>}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="family-title">
          <div className={styles.sectionHeader}><h2 id="family-title" className={styles.sectionTitle}>Accessi familiari</h2>{unit && <span className={styles.caption}>{members.length + 1} {members.length === 0 ? 'persona' : 'persone'}</span>}</div>
          {unit ? <>
            <p className={styles.hint}>Chi ha accesso può consultare le informazioni della stessa abitazione.</p>
            <div className={styles.surface}>
              <div className={styles.familyHead}><h3>Persone con accesso</h3><span>{members.length + 1} {members.length === 0 ? 'membro' : 'membri'}</span></div>
              <div className={styles.familyRow}>
                <span className={styles.miniAvatar} aria-hidden="true">{initials(fullName)}</span>
                <div className={styles.grow}><p className={styles.familyName}>{fullName || 'Nome non impostato'}</p><p className={styles.familyRole}>Tu</p></div>
                <Check size={16} className={styles.memberCheck} aria-hidden="true" />
              </div>
              {members.map(member => <div key={member.profile_id} className={styles.familyRow}>
                <span className={styles.miniAvatar} aria-hidden="true">{initials(member.full_name)}</span>
                <div className={styles.grow}><p className={styles.familyName}>{member.full_name || 'Nome non impostato'}</p><p className={styles.familyRole}>Membro dell’abitazione</p></div>
              </div>)}
              {invites.length > 0 && <>
                <div className={styles.familyHead}><h3>Inviti da condividere</h3><span>{invites.length} {invites.length === 1 ? 'attivo' : 'attivi'}</span></div>
                {invites.map(invite => <div key={invite.id} className={styles.invitation}>
                  <span className={styles.invitationBadge}><UserPlus size={17} aria-hidden="true" /></span>
                  <div className={styles.grow}><p className={styles.inviteTitle}>Invito familiare</p><p className={styles.inviteExpiry}>Scade il {expiryDate(invite.expires_at)}</p></div>
                  <button type="button" className={styles.inlineLink} aria-label={`Apri invito in scadenza il ${expiryDate(invite.expires_at)}`} aria-haspopup="dialog" onClick={() => openInvite(invite.token)}>Apri <ChevronRight size={15} aria-hidden="true" /></button>
                </div>)}
              </>}
              <div className={styles.inviteAction}>
                <Button ref={generateButton} type="button" variant="secondary" className={styles.fullAction} disabled={pending || invites.length >= 5} onClick={handleGenerateInvite}>
                  <UserPlus size={16} aria-hidden="true" />{pending ? 'Operazione in corso…' : invites.length >= 5 ? 'Limite inviti raggiunto' : 'Genera invito familiare'}
                </Button>
                <p className={styles.fineprint}>Ogni invito è valido 30 giorni. Massimo 5 inviti attivi per unità.</p>
                <p role="status" className="sr-only">{pending ? 'Operazione invito in corso.' : ''}</p>
              </div>
            </div>
          </> : <div className={`${styles.surface} ${styles.homeCard}`}><p className={styles.hint}>Gli accessi familiari richiedono un’abitazione associata.</p></div>}
          {!sheet && inviteError && <p role="alert" className={styles.error}>{inviteError}</p>}
        </section>

        <section className={styles.section} aria-labelledby="notifications-title">
          <h2 id="notifications-title" className={styles.sectionTitle}>Notifiche email</h2>
          <div className={`${styles.surface} ${styles.notifications}`} aria-busy={savingKey !== null}>
            <div className={styles.notifRow}>
              <div className={styles.grow}><h3 className={styles.notifTitle}>Avvisi di scadenza obbligatori</h3><p className={styles.notifDescription}>Promemoria e solleciti previsti dal piano.</p><span className="sr-only">Sempre attivi, non disattivabili.</span></div><Lock size={18} className={styles.lock} aria-hidden="true" />
            </div>
            {PREF_ROWS.map(row => <div key={row.emailKey} className={styles.notifRow}>
              <div className={styles.grow}><h3 className={styles.notifTitle}>{row.label}</h3><p className={styles.notifDescription}>{row.description}</p></div>
              <button type="button" role="switch" aria-label={row.label} aria-checked={prefs[row.emailKey]} aria-busy={savingKey === row.emailKey} disabled={savingKey !== null} className={styles.switch} onClick={() => handleTogglePref(row.emailKey)}><span className={styles.switchTrack} /></button>
            </div>)}
          </div>
          <p className={styles.lockNote}><Info size={15} aria-hidden="true" /><span>Gli avvisi obbligatori restano attivi. Le altre preferenze si possono modificare in qualsiasi momento.</span></p>
          {prefError && <p role="alert" className={styles.error}>{prefError}</p>}
          <p role="status" className={styles.feedback}>{savingKey ? 'Salvataggio…' : prefSaved ? 'Preferenze salvate.' : ''}</p>
        </section>

        <Button type="button" variant="secondary" className={styles.logout} aria-haspopup="dialog" onClick={() => setSheet({ kind: 'logout' })}><LogOut size={17} aria-hidden="true" />Esci dall’account</Button>
        <p className={styles.footCopy}>CasaZero · Area riservata residente</p>
      </div>

      <BottomSheet open={sheet !== null} onClose={closeSheet} title={title}>
        <div ref={sheetBody} className={styles.sheetBody}>
          {sheet?.kind === 'personal' && <DatiPersonaliClient fullName={fullName} phone={phone} email={email} embedded onSavingChange={saving => { profileBusy.current = saving }} onCancel={closeSheet} onSaved={() => {
            setSheet(null)
            showToast('success', 'Dati personali salvati.')
          }} />}
          {sheet?.kind === 'invite' && <>
            <p className={styles.microInfo}>Condividi questo link con una persona che vive nella tua abitazione.</p>
            {selectedInvite?.qrCode ? <Image className={styles.qr} src={selectedInvite.qrCode} alt="Codice QR del link dell’invito familiare" width={180} height={180} /> : <p role="status" className={styles.microInfo}>{selectedInvite ? 'QR non disponibile. Usa il link.' : 'Caricamento del dettaglio dell’invito…'}</p>}
            <p className={styles.label}>Link dell’invito</p><p className={styles.inviteLink}>{inviteUrl}</p>
            {selectedInvite && <p className={styles.fieldCaption}>Valido fino al {expiryDate(selectedInvite.expires_at)}.</p>}
            <div className={styles.sheetActions}>
              <Button type="button" className="w-full min-h-11 gap-2" onClick={copyUrl}>{copiedToken === selectedToken ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copiedToken === selectedToken ? 'Copiato' : 'Copia link'}</Button>
              {selectedInvite ? <Button type="button" variant="secondary" className={styles.revokeButton} disabled={pending} onClick={() => { setInviteError(null); setSheet({ kind: 'revoke', token: selectedToken }) }}>Revoca invito</Button>
                : <Button type="button" variant="secondary" className="w-full min-h-11" onClick={() => router.refresh()}>Aggiorna invito</Button>}
            </div>
          </>}
          {sheet?.kind === 'revoke' && <>
            <p className={styles.confirmCopy}>Il link non sarà più utilizzabile. Gli accessi già attivati resteranno invariati.</p>
            <div className={styles.sheetActions}>
              <Button type="button" className="w-full min-h-11" disabled={pending || !selectedInvite} onClick={handleRevokeInvite}>{pending ? 'Revoca in corso…' : 'Revoca invito'}</Button>
              <Button type="button" variant="secondary" className="w-full min-h-11" disabled={pending} onClick={closeSheet}>Annulla</Button>
            </div>
          </>}
          {sheet?.kind === 'logout' && <>
            <p className={styles.confirmCopy}>La sessione verrà chiusa. Per accedere di nuovo alla tua abitazione dovrai effettuare l’accesso.</p>
            <form action={signOut.bind(null, null)} className={styles.sheetActions}><LogoutButtons onCancel={closeSheet} /></form>
          </>}
          {sheet && inviteError && <p role="alert" className={styles.error}>{inviteError}</p>}
        </div>
      </BottomSheet>
    </div>
  )
}

function LogoutButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus()
  return <>
    <Button type="submit" className="w-full min-h-11" disabled={pending}>{pending ? 'Uscita in corso…' : 'Conferma uscita'}</Button>
    <Button type="button" variant="secondary" className="w-full min-h-11" disabled={pending} onClick={onCancel}>Annulla</Button>
    <p role="status" className="sr-only">{pending ? 'Uscita in corso…' : ''}</p>
  </>
}
