'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Copy, Check, Loader2,
  Mail, Phone, UserCheck, UserPlus, X,
} from 'lucide-react'
import { assignAdmin, removeAdminAssignment, createAdminInvite, getAdminEmail } from './admin-actions'
import { Button } from '@/components/ui/Button'

export type AdminProfile = {
  id: string
  full_name: string | null
  phone: string | null
}

type ViewState = 'dettaglio' | 'assegnazione' | 'conferma_cambio'

// ─── AdminModal — estratto fuori da AdminBlock per evitare rimontaggio ──────
// Definire un component function dentro un altro component causa unmount+remount
// ad ogni render perché React vede una nuova funzione reference ad ogni ciclo.

type AdminModalProps = {
  view: ViewState
  adminProfile: AdminProfile | null
  adminEmail: string | null
  emailLoading: boolean
  inviteToken: string | null
  appUrl: string
  copied: boolean
  pending: boolean
  serverError: string | null
  availableAdmins: AdminProfile[]
  onClose: () => void
  onSetView: (v: ViewState) => void
  onAssign: (profileId: string) => void
  onConfirmChange: () => void
  onGenerateInvite: () => void
  onCopyInvite: () => void
}

function AdminModal({
  view, adminProfile, adminEmail, emailLoading,
  inviteToken, appUrl, copied, pending, serverError,
  availableAdmins, onClose, onSetView, onAssign,
  onConfirmChange, onGenerateInvite, onCopyInvite,
}: AdminModalProps) {
  const inviteUrl = inviteToken ? `${appUrl}/welcome/${inviteToken}` : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* sheet */}
      <div className="relative z-10 bg-white rounded-t-2xl sm:rounded-xl border border-[#E4E6E2] w-full sm:max-w-sm mx-0 sm:mx-4 max-h-[85vh] overflow-y-auto">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#E4E6E2] sticky top-0 bg-white">
          <h2 className="text-sm font-medium text-[#20302A]">
            {view === 'dettaglio' ? 'Amministratore' : view === 'assegnazione' ? 'Assegna amministratore' : 'Cambia amministratore'}
          </h2>
          <div
            role="button"
            tabIndex={0}
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClose() }}
            className="p-1 rounded-lg text-[#20302A]/50 hover:bg-[#F4F3EF] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.6} />
          </div>
        </div>

        {/* body */}
        <div className="p-4 space-y-4">
          {view === 'dettaglio' && adminProfile ? (
            <>
              {/* Profilo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-5 h-5 text-[#0F6E56]" strokeWidth={1.6} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#20302A]">
                    {adminProfile.full_name ?? 'Amministratore'}
                  </p>
                  <p className="text-xs text-[#20302A]/50">Amministratore di condominio</p>
                </div>
              </div>

              {/* Contatti */}
              {(adminProfile.phone || emailLoading || adminEmail) && (
                <div className="space-y-2">
                  {adminProfile.phone && (
                    <div className="flex items-center gap-2 text-sm text-[#20302A]">
                      <Phone className="w-3.5 h-3.5 text-[#20302A]/40 flex-shrink-0" strokeWidth={1.6} />
                      <span>{adminProfile.phone}</span>
                    </div>
                  )}
                  {emailLoading && !adminEmail && (
                    <div className="flex items-center gap-2 text-sm text-[#20302A]/40">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.6} />
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  )}
                  {adminEmail && (
                    <div className="flex items-center gap-2 text-sm text-[#20302A]">
                      <Mail className="w-3.5 h-3.5 text-[#20302A]/40 flex-shrink-0" strokeWidth={1.6} />
                      <span className="truncate">{adminEmail}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Azioni contatto */}
              {(adminProfile.phone || adminEmail) && (
                <div className="flex gap-2">
                  {adminProfile.phone && (
                    <a
                      href={`tel:${adminProfile.phone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#04342C] text-white rounded-lg text-sm font-medium"
                    >
                      <Phone className="w-3.5 h-3.5" strokeWidth={1.6} />
                      Chiama
                    </a>
                  )}
                  {adminEmail && (
                    <a
                      href={`mailto:${adminEmail}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#04342C] text-white rounded-lg text-sm font-medium"
                    >
                      <Mail className="w-3.5 h-3.5" strokeWidth={1.6} />
                      Email
                    </a>
                  )}
                </div>
              )}

              {/* Cambia */}
              <div className="pt-1 border-t border-[#E4E6E2]">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSetView('conferma_cambio')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSetView('conferma_cambio') }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-[#E4E6E2] rounded-lg text-sm text-[#20302A]/60 cursor-pointer hover:bg-[#F4F3EF] transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" strokeWidth={1.6} />
                  Cambia amministratore
                </div>
              </div>
            </>
          ) : view === 'conferma_cambio' ? (
            <>
              <div>
                <p className="text-sm font-medium text-[#20302A]">Cambia amministratore?</p>
                <p className="text-sm text-[#20302A]/60 mt-1">
                  L&apos;amministratore attuale verrà rimosso. Potrai assegnarne uno nuovo subito dopo.
                </p>
              </div>
              <div className="flex gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSetView('dettaglio')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSetView('dettaglio') }}
                  className="flex-1 flex items-center justify-center px-3 py-2.5 border border-[#E4E6E2] rounded-lg text-sm text-[#20302A] cursor-pointer hover:bg-[#F4F3EF] transition-colors"
                >
                  Annulla
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!pending) onConfirmChange() }}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !pending) onConfirmChange() }}
                  aria-disabled={pending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#04342C] text-white rounded-lg text-sm font-medium cursor-pointer"
                >
                  {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Conferma
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Scegli esistente */}
              {availableAdmins.length > 0 ? (
                <div>
                  <p className="text-[10px] font-medium text-[#20302A]/50 uppercase tracking-wide mb-2">
                    Profili esistenti
                  </p>
                  <div className="space-y-1">
                    {availableAdmins.map(a => (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!pending) onAssign(a.id) }}
                        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !pending) onAssign(a.id) }}
                        aria-disabled={pending}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F4F3EF] cursor-pointer transition-colors${pending ? ' pointer-events-none opacity-50' : ''}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-medium text-[#0F6E56]">
                            {(a.full_name ?? '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="flex-1 text-sm text-[#20302A]">{a.full_name ?? 'Amministratore'}</p>
                        <ChevronLeft className="w-3.5 h-3.5 text-[#20302A]/30 rotate-180 flex-shrink-0" strokeWidth={1.6} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#20302A]/50 py-1">
                  Nessun profilo admin nel sistema — usa il link di invito.
                </p>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#E4E6E2]" />
                <span className="text-xs text-[#20302A]/40">oppure</span>
                <div className="flex-1 h-px bg-[#E4E6E2]" />
              </div>

              {/* Invita via link */}
              <div>
                <p className="text-[10px] font-medium text-[#20302A]/50 uppercase tracking-wide mb-2">
                  Invita via link
                </p>
                {!inviteToken ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!pending) onGenerateInvite() }}
                    onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !pending) onGenerateInvite() }}
                    aria-disabled={pending}
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 border border-[#E4E6E2] rounded-lg text-sm text-[#20302A] cursor-pointer hover:bg-[#F4F3EF] transition-colors"
                  >
                    {pending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <UserPlus className="w-3.5 h-3.5" strokeWidth={1.6} />
                    }
                    Genera invito
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-[#F4F3EF] rounded-lg px-3 py-2">
                      <p className="text-[11px] text-[#20302A]/60 font-mono break-all">{inviteUrl}</p>
                    </div>
                    <div className="flex gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={onCopyInvite}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onCopyInvite() }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#04342C] text-white rounded-lg text-sm cursor-pointer"
                      >
                        {copied
                          ? <Check className="w-3.5 h-3.5" strokeWidth={1.6} />
                          : <Copy className="w-3.5 h-3.5" strokeWidth={1.6} />
                        }
                        {copied ? 'Copiato' : 'Copia'}
                      </div>
                      <a
                        href={`mailto:?subject=${encodeURIComponent('Invito CasaZero — Amministratore')}&body=${encodeURIComponent(`Sei stato invitato come amministratore di condominio su CasaZero.\n\nAttiva il tuo accesso:\n${inviteUrl}\n\nIl link scade tra 30 giorni.`)}`}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 border border-[#E4E6E2] rounded-lg text-sm text-[#20302A]"
                      >
                        <Mail className="w-3.5 h-3.5" strokeWidth={1.6} />
                        Email
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {serverError && (
            <p className="text-xs text-[#A32D2D] bg-[#FCEBEB] rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AdminBlock ───────────────────────────────────────────────────────────────

export function AdminBlock({
  residenceId,
  adminProfile,
  availableAdmins,
  appUrl,
}: {
  residenceId: string
  adminProfile: AdminProfile | null
  availableAdmins: AdminProfile[]
  appUrl: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewState>('dettaglio')
  // Kept open during the remove→reassign flow even when adminProfile prop becomes null
  const [transitioning, setTransitioning] = useState(false)

  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open && view === 'dettaglio' && adminProfile?.id && adminEmail === null && !emailLoading) {
      setEmailLoading(true)
      getAdminEmail(adminProfile.id).then(res => {
        setEmailLoading(false)
        if (res.email) setAdminEmail(res.email)
      })
    }
  }, [open, view, adminProfile?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  function openDettaglio() {
    setServerError(null)
    setInviteToken(null)
    setView('dettaglio')
    setOpen(true)
  }

  function openAssegnazione() {
    setServerError(null)
    setInviteToken(null)
    setView('assegnazione')
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setTransitioning(false)
    setServerError(null)
    setInviteToken(null)
  }

  function handleAssign(profileId: string) {
    setServerError(null)
    startTransition(async () => {
      const res = await assignAdmin(residenceId, profileId)
      if (res.error) { setServerError(res.error); return }
      setTransitioning(false)
      startTransition(() => router.refresh())
      close()
    })
  }

  function handleConfirmChange() {
    setServerError(null)
    startTransition(async () => {
      const res = await removeAdminAssignment(residenceId)
      if (res.error) { setServerError(res.error); return }
      setTransitioning(true)
      setAdminEmail(null)
      setInviteToken(null)
      setView('assegnazione')
      startTransition(() => router.refresh())
    })
  }

  function handleGenerateInvite() {
    setServerError(null)
    startTransition(async () => {
      const res = await createAdminInvite(residenceId)
      if (res.error) { setServerError(res.error); return }
      setInviteToken(res.token!)
    })
  }

  function handleCopyInvite() {
    if (!inviteToken) return
    navigator.clipboard.writeText(`${appUrl}/welcome/${inviteToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {adminProfile ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openDettaglio}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openDettaglio() }}
          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-background transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-4 h-4 text-brand-medium" strokeWidth={1.6} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {adminProfile.full_name ?? 'Amministratore'}
            </p>
            <p className="text-xs text-text-secondary">Amministratore di condominio</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-text-secondary rotate-180 flex-shrink-0" strokeWidth={1.6} />
        </div>
      ) : !transitioning ? (
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-4 h-4 text-neutral-500" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Nessun amministratore assegnato</p>
              <p className="text-xs text-text-secondary">Assegna o invita un amministratore per questa residenza</p>
            </div>
          </div>
          <Button variant="secondary" onClick={openAssegnazione} className="flex-shrink-0">
            Invita amministratore
          </Button>
        </div>
      ) : null}
      {open && (
        <AdminModal
          view={view}
          adminProfile={adminProfile}
          adminEmail={adminEmail}
          emailLoading={emailLoading}
          inviteToken={inviteToken}
          appUrl={appUrl}
          copied={copied}
          pending={pending}
          serverError={serverError}
          availableAdmins={availableAdmins}
          onClose={close}
          onSetView={setView}
          onAssign={handleAssign}
          onConfirmChange={handleConfirmChange}
          onGenerateInvite={handleGenerateInvite}
          onCopyInvite={handleCopyInvite}
        />
      )}
    </>
  )
}
