'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { detectInstallPlatform, isStandalone, type InstallPlatform } from '@/lib/pwa'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  // null finché non siamo montati: la piattaforma si conosce solo nel browser,
  // e renderla dal server produrrebbe un mismatch di hydration.
  const [platform, setPlatform] = useState<InstallPlatform | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator))

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!platform || platform.kind === 'unsupported') return null

  if (installed) {
    return (
      <Card title="CasaZero è installata">
        <p className="flex items-center gap-2 text-sm text-[#0F6E56]">
          <Check className="w-4 h-4" strokeWidth={2} />
          La trovi nella schermata Home del telefono.
        </p>
      </Card>
    )
  }

  if (platform.kind === 'in-app') return <InAppBranch app={platform.app} os={platform.os} />
  if (platform.kind === 'ios') return <IosBranch />
  return <AndroidBranch installEvent={installEvent} onInstalled={() => setInstalled(true)} />
}

// ─── Rami ─────────────────────────────────────────────────────

function IosBranch() {
  return (
    <Card title="Installa CasaZero sul telefono" intro="Così la trovi tra le tue app, senza passare dall'App Store.">
      <Steps
        steps={[
          <>Tocca <Share className={INLINE_ICON} aria-hidden="true" /> <strong className="font-medium">Condividi</strong> nella barra in basso.</>,
          <>Scegli <SquarePlus className={INLINE_ICON} aria-hidden="true" /> <strong className="font-medium">Aggiungi alla schermata Home</strong>.</>,
          <>Conferma con <strong className="font-medium">Aggiungi</strong> in alto a destra.</>,
        ]}
      />
      <p className="text-xs text-[#20302A]/50">Non trovi la voce? Apri questo link in Safari e riprova.</p>
    </Card>
  )
}

function AndroidBranch({
  installEvent,
  onInstalled,
}: {
  installEvent: BeforeInstallPromptEvent | null
  onInstalled: () => void
}) {
  const [busy, setBusy] = useState(false)

  const install = async () => {
    if (!installEvent) return
    setBusy(true)
    try {
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === 'accepted') onInstalled()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Installa CasaZero sul telefono" intro="Così la trovi tra le tue app, senza passare dal Play Store.">
      {installEvent ? (
        <Button type="button" className="w-full gap-2" onClick={install} disabled={busy}>
          <Download className="w-4 h-4" aria-hidden="true" />
          Installa l&apos;app
        </Button>
      ) : (
        <Steps
          steps={[
            <>Tocca <EllipsisVertical className={INLINE_ICON} aria-hidden="true" /> <strong className="font-medium">i tre puntini</strong> in alto a destra.</>,
            <>Scegli <strong className="font-medium">Installa app</strong> oppure <strong className="font-medium">Aggiungi a schermata Home</strong>.</>,
          ]}
        />
      )}
    </Card>
  )
}

function InAppBranch({ app, os }: { app: string; os: 'ios' | 'android' | 'other' }) {
  const [copied, setCopied] = useState(false)
  const browser = os === 'ios' ? 'Safari' : 'Chrome'

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard negata dalla webview: restano le istruzioni manuali.
    }
  }

  return (
    <Card
      title={`Apri questo link in ${browser}`}
      intro={`Stai leggendo l'invito dentro ${app}: da qui l'app non si può installare.`}
    >
      <Steps
        steps={[
          <>Tocca <EllipsisVertical className={INLINE_ICON} aria-hidden="true" /> <strong className="font-medium">i tre puntini</strong> in alto a destra.</>,
          <>Scegli <strong className="font-medium">Apri in {browser}</strong>{os === 'ios' ? ' o Apri nel browser' : ''}.</>,
        ]}
      />
      <Button type="button" variant="secondary" className="w-full gap-2" onClick={copyLink}>
        {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
        {copied ? 'Link copiato' : `Oppure copia il link e incollalo in ${browser}`}
      </Button>
    </Card>
  )
}

// ─── Pezzi condivisi ──────────────────────────────────────────

const INLINE_ICON = 'inline w-3.5 h-3.5 -mt-0.5 text-[#0F6E56]'

function Card({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-[#E4E6E2] p-5 space-y-4" aria-label={title}>
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-[#20302A]">{title}</h2>
        {intro && <p className="text-xs text-[#20302A]/60 leading-relaxed">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-lg bg-[#E1F5EE] flex items-center justify-center text-xs font-medium text-[#0F6E56] flex-shrink-0">
            {i + 1}
          </span>
          <p className="text-sm text-[#20302A] leading-relaxed pt-1">{step}</p>
        </li>
      ))}
    </ol>
  )
}
