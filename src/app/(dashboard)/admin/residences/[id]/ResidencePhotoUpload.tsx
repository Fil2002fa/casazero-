'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus } from 'lucide-react'
import { updateResidencePhoto } from './actions'

interface Props {
  residenceId: string
  initialPhotoUrl: string | null
}

// Upload della foto (facciata) della residenza — visibile solo al super_admin.
// Riusa il pattern strutturale di IdentityTab (fileInputRef + openPicker +
// handleFileChange con object URL per l'anteprima + handleSubmit con FormData).
// A differenza di IdentityTab NON c'è hack onError/thumbError: il bucket è pubblico,
// un'immagine rotta è un bug vero e va mostrato, non mascherato.
export default function ResidencePhotoUpload({ residenceId, initialPhotoUrl }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [photoUrl] = useState<string | null>(initialPhotoUrl)
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [pickedPreview, setPickedPreview] = useState<string | null>(null) // object URL locale

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Il file appena scelto (object URL, sempre valido) ha priorità sull'URL del DB.
  const previewSrc = pickedPreview ?? photoUrl
  const hasPhoto = previewSrc !== null

  function openPicker() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPickedName(file.name)
    setPickedPreview(URL.createObjectURL(file))
    setError(null)
    setSuccess(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateResidencePhoto(formData)
      if (res.error) setError(res.error)
      else {
        setSuccess(true)
        // File salvato: teniamo l'object URL come sorgente affidabile per l'anteprima
        // finché la pagina non ricarica (il public URL ha path deterministico e può
        // essere servito dalla cache del browser con l'immagine precedente).
        setPickedName(null)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 border-b border-border">
      <input type="hidden" name="residence_id" value={residenceId} />
      <input
        ref={fileInputRef}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Riga compatta: la foto è un attributo d'identità di gestione, non un hero.
          Thumbnail a dimensione fissa (formato facciata) a sinistra, label + azione a destra.
          L'hero full-width resta solo nella vista residente ((app)/page.tsx). */}
      {hasPhoto ? (
        /* Foto presente — thumbnail + sostituisci */
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openPicker}
            className="w-20 h-14 rounded-lg overflow-hidden bg-background flex-shrink-0 cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc!} alt="Foto residenza" className="w-full h-full object-cover" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Foto residenza</p>
            <p className="text-xs text-text-secondary truncate">{pickedName ?? 'Foto attuale'}</p>
          </div>
          <button
            type="button"
            onClick={openPicker}
            className="text-xs text-brand-medium font-medium cursor-pointer flex-shrink-0"
          >
            Sostituisci
          </button>
        </div>
      ) : (
        /* Nessuna foto — thumbnail-placeholder piccola + aggiungi */
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openPicker}
            className="w-20 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center flex-shrink-0 text-text-secondary cursor-pointer"
          >
            <ImagePlus className="w-5 h-5" strokeWidth={1.6} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Foto residenza</p>
            <button
              type="button"
              onClick={openPicker}
              className="text-xs text-brand-medium font-medium cursor-pointer"
            >
              Aggiungi foto
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-lg p-3 mt-3">
          <p className="text-sm text-semantic-red">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-brand-light border border-brand-medium/20 rounded-lg p-3 mt-3">
          <p className="text-sm text-brand-dark">Foto salvata.</p>
        </div>
      )}

      {/* Il bottone di salvataggio compare solo quando c'è un file nuovo da caricare;
          dimensione contenuta, coerente con la riga compatta (non un CTA full-width). */}
      {pickedPreview && (
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-brand-dark text-white rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-3"
        >
          {pending ? 'Caricamento…' : 'Salva foto'}
        </button>
      )}
    </form>
  )
}
