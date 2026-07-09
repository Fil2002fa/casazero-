'use client'

import { useRef, useState, useTransition } from 'react'
import { Image as ImageIcon, ImagePlus } from 'lucide-react'
import { updateBuilderSettings, removeBuilderLogo } from './actions'
import { Input, Label, FieldHelp } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface Props {
  initialName: string
  initialLogoUrl: string | null
}

// Colore brand fisso CasaZero (design system §3 "Verde brand scuro").
const BRAND_DARK = '#04342C'
// Verde chiaro per la foglia sulla striscia scura dell'anteprima (§3 "verde chiaro").
const BRAND_LIGHT = '#9FE1CB'

// Foglia CasaZero — stesso path del layout reale ((dashboard)/layout.tsx), resa in
// verde chiaro per restare visibile sulla striscia scura dell'anteprima integrata.
function LeafMark({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M20 4C10.5 4 4 9.5 4 18.5c0 .55.4 1 .95 1C13.5 19.5 20 13.5 20 4z" fill={BRAND_LIGHT} />
      <path d="M7 17C10.5 11.5 13.5 9 17.5 7.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

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

        {/* Anteprima integrata — replica l'header reale dell'app */}
        <div>
          <div
            className="rounded-lg px-3 py-2.5 flex items-center gap-2"
            style={{ backgroundColor: BRAND_DARK }}
          >
            {previewSrc && !thumbError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt=""
                className="w-5 h-5 object-contain flex-shrink-0"
                onError={() => setThumbError(true)}
              />
            ) : (
              <LeafMark className="flex-shrink-0" />
            )}
            <span className="text-white text-sm font-medium truncate">{name || 'CasaZero'}</span>
            <span className="ml-auto text-[10px] text-white/50 flex-shrink-0">così appare nell&apos;header</span>
          </div>
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
