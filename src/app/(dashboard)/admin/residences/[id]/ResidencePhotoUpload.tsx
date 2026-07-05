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

      {hasPhoto ? (
        /* Foto presente — anteprima + sostituisci */
        <div className="space-y-3">
          <button
            type="button"
            onClick={openPicker}
            className="block w-full aspect-video rounded-lg overflow-hidden bg-background cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc!} alt="Foto residenza" className="w-full h-full object-cover" />
          </button>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-text-secondary truncate">{pickedName ?? 'Foto attuale'}</p>
            <button
              type="button"
              onClick={openPicker}
              className="text-xs text-brand-medium font-medium cursor-pointer flex-shrink-0"
            >
              Sostituisci
            </button>
          </div>
        </div>
      ) : (
        /* Nessuna foto — placeholder cliccabile */
        <button
          type="button"
          onClick={openPicker}
          className="w-full aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-text-secondary cursor-pointer"
        >
          <ImagePlus className="w-6 h-6" strokeWidth={1.6} />
          <span className="text-sm font-medium">Aggiungi foto</span>
          <span className="text-xs">JPG, PNG o WEBP · max 5 MB</span>
        </button>
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

      {/* Il bottone di salvataggio compare solo quando c'è un file nuovo da caricare */}
      {pickedPreview && (
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-3"
        >
          {pending ? 'Caricamento…' : 'Salva foto'}
        </button>
      )}
    </form>
  )
}
