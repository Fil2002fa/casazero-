import { createServiceClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Home, FileText, Wrench, ClipboardList, Shield } from 'lucide-react'

type Params = Promise<{ token: string }>

type BuilderRow = { name: string; logo_url: string | null; primary_color: string | null } | null
type ResidenceRow = { name: string; address: string | null; builder_id: string; builders: BuilderRow } | null
type UnitRow = { label: string; residence_id: string; residences: ResidenceRow } | null

export default async function WelcomePage({ params }: { params: Params }) {
  const { token } = await params
  const svc = createServiceClient()

  const { data: invite } = await svc
    .from('invites')
    .select('id, unit_id, residence_id, role, expires_at, used_at, units(label, residence_id, residences(name, address, builder_id, builders(name, logo_url, primary_color)))')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return <InviteError message="Invito non valido o già utilizzato." />
  }
  if (new Date(invite.expires_at) < new Date()) {
    return <InviteError message="Questo invito è scaduto. Richiedi un nuovo link al costruttore." />
  }

  const unitData = invite.units as unknown as UnitRow
  const resolvedResidenceId: string | null = unitData?.residence_id ?? invite.residence_id ?? null

  let residence: ResidenceRow = unitData?.residences ?? null
  let builder: BuilderRow = residence?.builders ?? null

  // Inviti admin: unit_id = null → residence non disponibile via units join
  if (!residence && resolvedResidenceId) {
    const { data: res } = await svc
      .from('residences')
      .select('name, address, builder_id, builders(name, logo_url, primary_color)')
      .eq('id', resolvedResidenceId)
      .maybeSingle()
    residence = res as unknown as ResidenceRow
    builder = residence?.builders ?? null
  }

  const brandDark = builder?.primary_color?.trim() || '#04342C'

  let unitCount: number | null = null
  if ((invite.role === 'admin' || invite.role === 'super_admin') && resolvedResidenceId) {
    const { count } = await svc
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', resolvedResidenceId)
    unitCount = count
  }

  if (invite.role === 'client') {
    return (
      <WelcomeResidente
        token={token}
        unitLabel={unitData?.label ?? null}
        residence={residence}
        builder={builder}
        brandDark={brandDark}
        inviteUsed={!!invite.used_at}
      />
    )
  }

  // admin, super_admin, o role non gestito → registro professionale
  return (
    <WelcomeAdmin
      token={token}
      residence={residence}
      builder={builder}
      brandDark={brandDark}
      unitCount={unitCount}
      inviteUsed={!!invite.used_at}
    />
  )
}

// ─── Branch Residente ─────────────────────────────────────────

function WelcomeResidente({
  token,
  unitLabel,
  residence,
  builder,
  brandDark,
  inviteUsed,
}: {
  token: string
  unitLabel: string | null
  residence: ResidenceRow
  builder: BuilderRow
  brandDark: string
  inviteUsed: boolean
}) {
  return (
    <div className="min-h-svh bg-[#F4F3EF] flex flex-col">
      {/* Hero emozionale */}
      <div
        className="relative px-6 pt-10 pb-8 text-white overflow-hidden"
        style={{ backgroundColor: brandDark }}
      >
        <RoofKeyIllustration />
        <div className="relative z-10">
          <p className="text-xs font-medium uppercase tracking-wider text-white/60 mb-4">
            {builder?.name ?? 'CasaZero'}
          </p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Benvenuto a casa
          </h1>
          {(residence?.name || unitLabel) && (
            <p className="text-sm text-white/80 mt-2">
              {[residence?.name, unitLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 px-5 py-6 space-y-5">
        {/* Tagline */}
        <p className="text-sm text-[#20302A]/60 leading-relaxed">
          Le chiavi sono tue. Da oggi anche la storia della tua casa vive qui dentro.
        </p>

        {/* Card libretto */}
        <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 space-y-4">
          <h2 className="text-sm font-medium text-[#20302A]">Il tuo libretto digitale include</h2>
          <div className="space-y-3">
            <FeatureRow
              icon={<Wrench className="w-4 h-4" />}
              title="27 manutenzioni"
              desc="Scadenzario automatico con priorità e promemoria"
            />
            <FeatureRow
              icon={<ClipboardList className="w-4 h-4" />}
              title="Fascicolo permanente"
              desc="Registro immutabile di ogni intervento"
            />
            <FeatureRow
              icon={<FileText className="w-4 h-4" />}
              title="Documenti"
              desc="Certificati, garanzie, planimetrie e manuali"
            />
            {/* Passaggio di proprietà — desc in ambra */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#E1F5EE] flex items-center justify-center text-[#0F6E56] flex-shrink-0">
                <Home className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#20302A]">Passaggio di proprietà</p>
                <p className="text-xs text-[#854F0B]">Il fascicolo resta all&apos;unità</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href={`/auth/login?invite=${token}`}
            className="block w-full text-center px-6 py-4 rounded-xl font-medium text-white text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ backgroundColor: brandDark }}
          >
            Accedi e attiva il tuo account
          </Link>
          <p className="text-xs text-center text-[#20302A]/50">
            Hai già un account? Usa lo stesso link — ti colleghiamo all&apos;unità.
          </p>
        </div>

        {inviteUsed && <InviteUsedBanner />}
      </div>
    </div>
  )
}

// ─── Branch Amministratore ────────────────────────────────────

function WelcomeAdmin({
  token,
  residence,
  builder,
  brandDark,
  unitCount,
  inviteUsed,
}: {
  token: string
  residence: ResidenceRow
  builder: BuilderRow
  brandDark: string
  unitCount: number | null
  inviteUsed: boolean
}) {
  const heroSub = [
    residence?.address,
    unitCount != null ? `${unitCount} unità` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="min-h-svh bg-[#F4F3EF] flex flex-col">
      {/* Hero professionale */}
      <div
        className="px-6 pt-10 pb-8 text-white"
        style={{ backgroundColor: brandDark }}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-white/60 mb-4">
          {builder?.name ?? 'CasaZero'}
        </p>
        <p className="text-sm text-white/70 mb-1">Sei stato nominato amministratore di</p>
        <h1 className="text-2xl font-semibold leading-tight">
          {residence?.name ?? 'Residenza'}
        </h1>
        {heroSub && (
          <p className="text-sm text-white/70 mt-1.5">{heroSub}</p>
        )}
      </div>

      <div className="flex-1 px-5 py-6 space-y-5 w-full sm:max-w-lg sm:mx-auto">
        {/* Card gestione */}
        <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 space-y-4">
          <h2 className="text-sm font-medium text-[#20302A]">Cosa potrai gestire</h2>
          <div className="space-y-3">
            <FeatureRow
              icon={<Wrench className="w-4 h-4" />}
              title="Manutenzioni condominiali"
              desc="Il ciclo N3: prendi in carico → in corso → completata, con allegati."
            />
            <FeatureRow
              icon={<FileText className="w-4 h-4" />}
              title="Documenti di residenza"
              desc="Carichi e aggiorni verbali, certificati e conformità."
            />
            <FeatureRow
              icon={<ClipboardList className="w-4 h-4" />}
              title="Panoramica scadenze"
              desc="Lo stato di tutte le manutenzioni condominiali in un colpo d'occhio."
            />
          </div>
        </div>

        {/* Banner legale */}
        <div className="bg-[#E1F5EE] rounded-xl border border-[#0F6E56]/20 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#04342C] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Shield className="w-4 h-4 text-white" strokeWidth={1.6} />
          </div>
          <p className="text-sm text-[#04342C] leading-relaxed pt-0.5">
            Ogni intervento che completi entra nel fascicolo legale dell&apos;immobile.
          </p>
        </div>

        {/* CTA */}
        <Link
          href={`/auth/login?invite=${token}`}
          className="block w-full text-center px-6 py-4 rounded-xl font-medium text-white text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ backgroundColor: brandDark }}
        >
          Accedi come amministratore
        </Link>

        {inviteUsed && <InviteUsedBanner />}
      </div>
    </div>
  )
}

// ─── SVG Filigrana (solo hero residente) ─────────────────────

function RoofKeyIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: 0.07 }}
    >
      {/* Sagome tetti */}
      <polygon fill="white" points="-10,200 -10,148 62,78 134,148 134,200" />
      <rect fill="white" x="52" y="78" width="10" height="28" />
      <polygon fill="white" points="94,200 94,130 178,52 262,130 262,200" />
      <rect fill="white" x="168" y="52" width="12" height="30" />
      <polygon fill="white" points="218,200 218,140 292,82 366,140 366,200" />
      <polygon fill="white" points="318,200 318,152 386,98 410,120 410,200" />
      {/* Chiave — angolo alto destra */}
      <circle cx="330" cy="40" r="18" fill="none" stroke="white" strokeWidth="13" />
      <rect fill="white" x="343" y="34" width="50" height="11" rx="5.5" />
      <rect fill="white" x="380" y="45" width="11" height="16" rx="3" />
      <rect fill="white" x="363" y="45" width="11" height="12" rx="3" />
    </svg>
  )
}

// ─── Componenti condivisi ─────────────────────────────────────

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#E1F5EE] flex items-center justify-center text-[#0F6E56] flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-[#20302A]">{title}</p>
        <p className="text-xs text-[#20302A]/50">{desc}</p>
      </div>
    </div>
  )
}

function InviteUsedBanner() {
  return (
    <div className="bg-[#FAEEDA] rounded-xl border border-[#854F0B]/20 p-4">
      <p className="text-xs text-[#854F0B]">
        Questo invito è già stato utilizzato. Se sei il proprietario, accedi normalmente.
      </p>
    </div>
  )
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="min-h-svh bg-[#F4F3EF] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 bg-[#FCEBEB] rounded-full flex items-center justify-center mx-auto">
          <span className="text-2xl font-medium text-[#A32D2D]">!</span>
        </div>
        <h1 className="text-lg font-medium text-[#20302A]">Invito non disponibile</h1>
        <p className="text-sm text-[#20302A]/60">{message}</p>
        <Link
          href="/auth/login"
          className="inline-block px-6 py-3 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#04342C' }}
        >
          Vai al login
        </Link>
      </div>
    </div>
  )
}
