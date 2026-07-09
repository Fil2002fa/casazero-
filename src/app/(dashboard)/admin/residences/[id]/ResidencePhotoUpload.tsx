'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus } from 'lucide-react'
import { updateResidencePhoto } from './actions'
import { MAX_PHOTO_BYTES } from './constants'

interface Props {
  residenceId: string
  initialPhotoUrl: string | null
  title: string
  subtitle?: string | null
}

// Upload della foto (facciata) della residenza — visibile solo al super_admin.
// Riusa il pattern strutturale di IdentityTab (fileInputRef + openPicker +
// handleFileChange con object URL per l'anteprima + handleSubmit con FormData).
// A differenza di IdentityTab NON c'è hack onError/thumbError: il bucket è pubblico,
// un'immagine rotta è un bug vero e va mostrato, non mascherato.
// Il componente possiede lo stato di upload MA renderizza anche nome/indirizzo
// della residenza: sono la stessa riga di testata (thumbnail + identità), non ha
// senso spezzarli in due componenti che devono restare visivamente allineati.
export default function ResidencePhotoUpload({ residenceId, initialPhotoUrl, title, subtitle }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [photoUrl] = useState<string | null>(initialPhotoUrl)
  const [pickedPreview, setPickedPreview] = useState<string | null>(null) // object URL locale
  const [dirty, setDirty] = useState(false) // file scelto non ancora salvato → mostra "Salva foto"

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
    // Validazione dimensione lato client: blocca >5MB prima di chiamare la Server
    // Action. Non imposta il file come selezionato (niente dirty/preview) e ripulisce
    // l'input; la foto già presente resta invariata.
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Immagine troppo grande, massimo 5 MB')
      setSuccess(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    // Igiene memoria: revoca l'object-URL precedente prima di crearne uno nuovo,
    // così non accumuliamo blob a ogni sostituzione.
    if (pickedPreview) URL.revokeObjectURL(pickedPreview)
    setPickedPreview(URL.createObjectURL(file))
    setDirty(true)
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
        // Torna a riposo: il flag "dirty" si azzera → il bottone "Salva foto" sparisce.
        // NON azzeriamo pickedPreview: resta la sorgente visiva così la thumbnail mostra
        // la foto appena scelta (niente flicker sulla foto vecchia); verrà sostituita dal
        // nuovo initialPhotoUrl al prossimo render server (revalidatePath già chiamato).
        setDirty(false)
        // Ripulisci l'input così un re-select dello STESSO file rifà scattare onChange.
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="residence_id" value={residenceId} />
      <input
        ref={fileInputRef}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Testata: thumbnail 96×72 a sinistra, identità residenza accanto.
          L'hero full-width resta solo nella vista residente ((app)/page.tsx). */}
      <div className="flex items-start gap-4">
        {hasPhoto ? (
          <button
            type="button"
            onClick={openPicker}
            aria-label="Sostituisci foto residenza"
            className="w-24 h-[72px] rounded-xl overflow-hidden bg-background flex-shrink-0 cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc!} alt="" className="w-full h-full object-cover" />
          </button>
        ) : (
          <button
            type="button"
            onClick={openPicker}
            aria-label="Aggiungi foto residenza"
            className="w-24 h-[72px] rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0 text-text-secondary cursor-pointer"
          >
            <ImagePlus className="w-5 h-5" strokeWidth={1.6} />
          </button>
        )}

        <div className="flex-1 min-w-0 pt-1">
          <h1 className="font-serif text-3xl font-semibold text-text-primary text-balance">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
        </div>
      </div>

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

      {/* Il bottone di salvataggio compare solo quando c'è un file nuovo non salvato. */}
      {dirty && (
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
