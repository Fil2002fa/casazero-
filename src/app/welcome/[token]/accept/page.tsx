import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { InviteError } from '../InviteError'

type Params = Promise<{ token: string }>

const ACTIVATION_ERROR = 'Errore temporaneo durante l\'attivazione, riprova tra poco.'

export default async function AcceptInvitePage({ params }: { params: Params }) {
  const { token } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/auth/login?invite=${token}`)

  const admin = createServiceClient()

  const { data: invite, error: inviteError } = await admin
    .from('invites')
    .select('id, unit_id, residence_id, role, expires_at, used_at, units(residence_id, residences(builder_id))')
    .eq('token', token)
    .is('used_at', null)
    .maybeSingle()

  if (inviteError) {
    console.error('accept: errore lettura invito', inviteError)
    return <InviteError message="Errore temporaneo, riprova tra poco." />
  }

  // Token invalido, scaduto, o già usato — va bene lo stesso, mandiamo alla home
  if (!invite || new Date(invite.expires_at) < new Date()) {
    redirect('/')
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    console.error('accept: errore lettura profilo', profileError ?? 'profilo assente')
    return <InviteError message="Errore temporaneo, riprova tra poco." />
  }

  // Un invito può solo far salire un client: mai cambiare il ruolo di un account di gestione.
  if (profile.role !== 'client' && profile.role !== invite.role) {
    return (
      <InviteError
        message="Questo account ha già un ruolo di gestione su CasaZero e l'invito non può cambiarlo. Accedi con un altro indirizzo email."
        loginHref={`/auth/login?invite=${token}`}
      />
    )
  }

  // Ricava builder_id dal percorso unit → residence → builder
  const unitData = invite.units as unknown as { residence_id: string; residences: { builder_id: string } | null } | null
  const builderId = unitData?.residences?.builder_id ?? null
  const residenceIdFromUnit = unitData?.residence_id ?? invite.residence_id

  // Ogni scrittura fallita si ferma prima di used_at: l'invito resta riutilizzabile per riprovare.
  const { error: profileUpdateError } = await admin.from('profiles').update({
    role: invite.role ?? 'client',
    ...(builderId ? { builder_id: builderId } : {}),
  }).eq('id', user.id)

  if (profileUpdateError) {
    console.error('accept: errore aggiornamento profilo', profileUpdateError)
    return <InviteError message={ACTIVATION_ERROR} />
  }

  // Collega l'unità (se invite ha unit_id)
  if (invite.unit_id) {
    // Controlla se esiste già un membership attivo
    const { data: existing, error: existingError } = await admin
      .from('unit_members')
      .select('id')
      .eq('unit_id', invite.unit_id)
      .eq('profile_id', user.id)
      .is('ended_at', null)
      .maybeSingle()

    if (existingError) {
      console.error('accept: errore lettura membership', existingError)
      return <InviteError message={ACTIVATION_ERROR} />
    }

    if (!existing) {
      const { error: memberError } = await admin.from('unit_members').insert({
        unit_id: invite.unit_id,
        profile_id: user.id,
        started_at: new Date().toISOString().split('T')[0],
        is_primary: true,
      })

      if (memberError) {
        console.error('accept: errore collegamento unità', memberError)
        return <InviteError message={ACTIVATION_ERROR} />
      }
    }
  }

  // Se è un admin, assegna alla residenza
  if ((invite.role === 'admin' || invite.role === 'super_admin') && residenceIdFromUnit) {
    const { error: assignmentError } = await admin.from('admin_assignments').upsert({
      profile_id: user.id,
      residence_id: residenceIdFromUnit,
    }, { onConflict: 'profile_id,residence_id', ignoreDuplicates: true })

    if (assignmentError) {
      console.error('accept: errore assegnazione residenza', assignmentError)
      return <InviteError message={ACTIVATION_ERROR} />
    }
  }

  // Segna invito come usato
  const { error: usedError } = await admin.from('invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id)

  if (usedError) {
    console.error('accept: errore chiusura invito', usedError)
    return <InviteError message={ACTIVATION_ERROR} />
  }

  redirect('/')
}
