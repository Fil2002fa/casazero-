'use client'

import { useRef, useState, useTransition } from 'react'
import { Image as ImageIcon, ImagePlus } from 'lucide-react'
import { updateBuilderSettings, removeBuilderLogo } from './actions'
import { Input, Label, FieldHelp } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { WhitelabelStrip } from '@/components/WhitelabelStrip'

interface Props {
  initialName: string
  initialLogoUrl: string | null
}

// Colore brand fisso CasaZero (design system §3 "Verde brand scuro"), usato
// solo per lo sfondo dello swatch anteprima logo qui sotto — la striscia
// "così appare nell'header" riusa lo stesso colore da WhitelabelStrip.
const BRAND_DARK = '#04342C'

export default function IdentityTab({ initialName, initialLogoUrl }: Props) {
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const [removing, startRemoving] = useTransition()

  const [name, setName] = useState(initialName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [pickedPreview, setPickedPreview] = useState<string | null>(null) // object URL locale
  const [thumbError, setThumbError] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasLogo = pickedPreview !== null || logoUrl !== null
  // Sorgente per thumbnail e anteprima: il file appena scelto (object URL, sempre
  // valido) ha priorità sull'URL del DB. NOTA: il logo salvato punta a un bucket
  // privato — l'URL pubblico risponde 400 (bug noto, fuori scope): per questo la
  // thumbnail ha un fallback su onError e non ci si affida a quell'URL.
  const previewSrc = pickedPreview ?? logoUrl

  function openPicker() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPickedName(file.name)
    setPickedPreview(URL.createObjectURL(file))
    setThumbError(false)
  }

  function handleRemove() {
    startRemoving(async () => {
      const res = await removeBuilderLogo()
      if (res.error) { showToast('error', res.error); return }
      setLogoUrl(null)
      setPickedName(null)
      setPickedPreview(null)
      setThumbError(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      showToast('success', 'Logo rimosso.')
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateBuilderSettings(formData)
      if (res.error) showToast('error', res.error)
      else {
        showToast('success', 'Identità salvata. Ricarica l’app per vedere le modifiche.')
        // File salvato: non è più "in attesa", ma teniamo l'object URL come sorgente
        // affidabile per la thumbnail finché la pagina non ricarica.
        setPickedName(null)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Card 1 — Nome costruttore */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Nome costruttore</h2>
        <Label htmlFor="builder-name">Nome costruttore</Label>
        <Input
          id="builder-name"
          type="text"
          name="name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="es. Furlan Costruzioni"
        />
        <FieldHelp>Appare nell&apos;app dei residenti e nei report PDF</FieldHelp>
      </div>

      {/* Card 2 — Logo */}
      <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900">Logo</h2>

        {/* Input file nascosto, inviato con il form al salvataggio */}
        <input
          ref={fileInputRef}
          type="file"
          name="logo"
          accept="image/png,image/svg+xml,image/jpeg"
          onChange={handleFileChange}
          className="hidden"
        />

        {hasLogo ? (
          /* Stato A — logo presente */
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: BRAND_DARK }}
            >
              {previewSrc && !thumbError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt="Logo costruttore"
                  className="w-full h-full object-contain"
                  onError={() => setThumbError(true)}
                />
              ) : (
                <ImageIcon className="w-5 h-5 text-white/60" strokeWidth={1.6} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{pickedName ?? 'Logo caricato'}</p>
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={openPicker}
                  className="text-xs text-brand-medium font-medium cursor-pointer"
                >
                  Sostituisci
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-xs text-semantic-red font-medium cursor-pointer disabled:opacity-50"
                >
                  {removing ? 'Rimozione…' : 'Rimuovi'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Stato B — nessun logo */
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center flex-shrink-0 text-text-secondary">
              <ImagePlus className="w-5 h-5" strokeWidth={1.6} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-text-secondary">Nessun logo caricato</p>
              <button
                type="button"
                onClick={openPicker}
                className="text-xs text-brand-medium font-medium mt-1 cursor-pointer"
              >
                Carica logo
              </button>
            </div>
          </div>
        )}

        {/* Anteprima integrata — stesso componente dell'header reale della shell */}
        <div>
          <WhitelabelStrip name={name} logoSrc={previewSrc}>
            <span className="ml-auto text-[10px] text-white/50 flex-shrink-0">così appare nell&apos;header</span>
          </WhitelabelStrip>
          <p className="text-xs text-text-secondary mt-2">
            PNG o SVG, max 2 MB. Se rimosso, si usa l&apos;icona CasaZero.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Salvataggio…' : 'Salva identità'}
      </Button>
    </form>
  )
}
