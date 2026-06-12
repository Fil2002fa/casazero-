import { createServiceClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Home, FileText, Wrench, ClipboardList } from 'lucide-react'

type Params = Promise<{ token: string }>

export default async function WelcomePage({ params }: { params: Params }) {
  const { token } = await params
  const admin = createServiceClient()

  const { data: invite } = await admin
    .from('invites')
    .select('id, unit_id, role, expires_at, used_at, units(label, residences(name, address, builder_id, builders(name, logo_url, primary_color)))')
    .eq('token', token)
    .maybeSingle()

  // Invite non trovato o già usato
  if (!invite) {
    return <InviteError message="Invito non valido o già utilizzato." />
  }

  // Invito scaduto
  if (new Date(invite.expires_at) < new Date()) {
    return <InviteError message="Questo invito è scaduto. Richiedi un nuovo link al costruttore." />
  }

  const unit = invite.units as unknown as {
    label: string
    residences: {
      name: string
      address: string | null
      builder_id: string
      builders: { name: string; logo_url: string | null; primary_color: string } | null
    } | null
  } | null

  const residence = unit?.residences
  const builder = residence?.builders

  const brandDark = builder?.primary_color ?? '#04342C'

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header brand */}
      <div
        className="px-6 py-8 text-white"
        style={{ backgroundColor: brandDark }}
      >
        <p className="text-sm opacity-75 mb-1">{builder?.name ?? 'CasaZero'}</p>
        <h1 className="text-2xl font-medium leading-tight">
          Benvenuto nella tua casa
        </h1>
        {residence?.name && (
          <p className="text-sm opacity-90 mt-1">{residence.name} · {unit?.label}</p>
        )}
        {residence?.address && (
          <p className="text-xs opacity-70 mt-0.5">{residence.address}</p>
        )}
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Cosa ti aspetta */}
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-medium text-text-primary">Il tuo libretto digitale include</h2>
          <div className="space-y-3">
            <Feature icon={<Wrench className="w-4 h-4" />} title="27 manutenzioni" desc="Scadenzario automatico con priorità e promemoria" />
            <Feature icon={<ClipboardList className="w-4 h-4" />} title="Fascicolo permanente" desc="Registro immutabile di ogni intervento" />
            <Feature icon={<FileText className="w-4 h-4" />} title="Documenti" desc="Certificati, garanzie, planimetrie e manuali" />
            <Feature icon={<Home className="w-4 h-4" />} title="Passaggio di proprietà" desc="Il fascicolo resta all'unità, non alla persona" />
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href={`/auth/login?invite=${token}`}
            className="block w-full text-center px-6 py-4 rounded-xl font-medium text-white text-sm"
            style={{ backgroundColor: brandDark }}
          >
            Accedi e attiva il tuo account
          </Link>
          <p className="text-xs text-center text-text-secondary">
            Hai già un account? Usa lo stesso link — ti collegheremo all&apos;unità automaticamente.
          </p>
        </div>

        {invite.used_at && (
          <div className="bg-semantic-amber-bg rounded-xl border border-semantic-amber/20 p-4">
            <p className="text-xs text-semantic-amber">
              Questo invito è già stato utilizzato. Se sei il proprietario, accedi normalmente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center text-brand-medium flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{desc}</p>
      </div>
    </div>
  )
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="min-h-svh bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 bg-semantic-red-bg rounded-full flex items-center justify-center mx-auto">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-medium text-text-primary">Invito non disponibile</h1>
        <p className="text-sm text-text-secondary">{message}</p>
        <Link href="/auth/login" className="inline-block px-6 py-3 bg-brand-dark text-white rounded-xl text-sm font-medium">
          Vai al login
        </Link>
      </div>
    </div>
  )
}
