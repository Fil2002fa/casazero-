'use client'

import { Copy, MessageCircle, Mail, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { formatDateIT } from '@/lib/formatDate'

// Un invito attivo con le sue azioni di condivisione. Stesso componente nella
// card dell'unità e nella schermata di successo di "Registra consegna": la
// revoca esiste solo dove è passato onRevoke (la card).
export function InviteLinkCard({
  url, expiresAt, onRevoke, revokeDisabled,
}: {
  url: string
  expiresAt: string
  onRevoke?: () => void
  revokeDisabled?: boolean
}) {
  const { showToast } = useToast()

  function copy() {
    navigator.clipboard.writeText(url)
    showToast('success', 'Link copiato.')
  }

  return (
    <div className="bg-background rounded-lg p-3 space-y-2">
      <p className="text-xs text-text-primary break-all">{url}</p>
      <p className="text-xs text-text-secondary">Scade il {formatDateIT(expiresAt)}</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-primary bg-surface rounded-lg text-xs"
        >
          <Copy className="w-3 h-3" />
          Copia link
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Benvenuto in CasaZero! Attiva il tuo accesso da qui: ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs"
        >
          <MessageCircle className="w-3 h-3" />
          WhatsApp
        </a>
        <button
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent('Il tuo invito a CasaZero')}&body=${encodeURIComponent(`Benvenuto in CasaZero.\n\nAttiva il tuo accesso da questo link:\n${url}\n\nA presto.`)}`
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs"
        >
          <Mail className="w-3 h-3" />
          Email
        </button>
        {onRevoke && (
          <button
            onClick={onRevoke}
            disabled={revokeDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-semantic-red/30 text-semantic-red rounded-lg text-xs"
          >
            <Trash2 className="w-3 h-3" />
            Revoca
          </button>
        )}
      </div>
    </div>
  )
}
