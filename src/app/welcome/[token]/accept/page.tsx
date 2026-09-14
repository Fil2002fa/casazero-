import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { InviteError } from '../InviteError'

type Params = Promise<{ token: string }>

export default async function AcceptInvitePage({ params }: { params: Params }) {
  const { token } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/auth/login?invite=${token}`)

  const admin = createServiceClient()

  const { data: invite } = await admin
    .from('invites')
    .select('id, unit_id, residence_id, role, expires_at, used_at, units(residence_id, residences(builder_id))')
    .eq('token', token)
    .is('used_at', null)
    .maybeSingle()

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

  // Aggiorna profilo (ruolo + builder)
  await admin.from('profiles').update({
    role: invite.role ?? 'client',
    ...(builderId ? { builder_id: builderId } : {}),
  }).eq('id', user.id)

  // Collega l'unità (se invite ha unit_id)
  if (invite.unit_id) {
    // Controlla se esiste già un membership attivo
    const { data: existing } = await admin
      .from('unit_members')
      .select('id')
      .eq('unit_id', invite.unit_id)
      .eq('profile_id', user.id)
      .is('ended_at', null)
      .maybeSingle()

    if (!existing) {
      await admin.from('unit_members').insert({
        unit_id: invite.unit_id,
        profile_id: user.id,
        started_at: new Date().toISOString().split('T')[0],
        is_primary: true,
      })
    }
  }

  // Se è un admin, assegna alla residenza
  if ((invite.role === 'admin' || invite.role === 'super_admin') && residenceIdFromUnit) {
    await admin.from('admin_assignments').upsert({
      profile_id: user.id,
      residence_id: residenceIdFromUnit,
    }, { onConflict: 'profile_id,residence_id', ignoreDuplicates: true })
  }

  // Segna invito come usato
  await admin.from('invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id)

  redirect('/')
}
