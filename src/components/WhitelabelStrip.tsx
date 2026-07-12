'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

// Stessa CSS var di sistema usata da BrandMark.tsx — iniettata per-request su
// (dashboard)/layout.tsx, oggi fissa a #04342C ma punto di controllo unico
// se il colore dovesse tornare personalizzabile dal costruttore.
const BRAND_DARK = 'var(--wl-brand-dark, #04342C)'
const BRAND_LIGHT = '#9FE1CB'

// Foglia CasaZero, resa in verde chiaro per restare visibile sulla striscia
// scura — fallback quando il costruttore non ha un logo o l'URL fallisce.
function LeafMark({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M20 4C10.5 4 4 9.5 4 18.5c0 .55.4 1 .95 1C13.5 19.5 20 13.5 20 4z" fill={BRAND_LIGHT} />
      <path d="M7 17C10.5 11.5 13.5 9 17.5 7.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

interface WhitelabelStripProps {
  name: string
  logoSrc: string | null
  className?: string
  children?: React.ReactNode
}

// Striscia identità costruttore — stessa resa nell'header reale della shell
// dashboard ((dashboard)/layout.tsx) e nell'anteprima di Impostazioni →
// Identità (IdentityTab.tsx), fonte unica per non duplicare markup/fallback.
// Fallback grazioso su errore di caricamento immagine (es. logo_url che punta
// a un bucket privato e risponde 400): torna alla foglia CasaZero invece di
// mostrare un'icona rotta.
export function WhitelabelStrip({ name, logoSrc, className, children }: WhitelabelStripProps) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => { setImgError(false) }, [logoSrc])

  const showLogo = logoSrc !== null && !imgError

  return (
    <div
      className={cn('rounded-lg px-3 py-2.5 flex items-center gap-2', className)}
      style={{ backgroundColor: BRAND_DARK }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          className="w-5 h-5 object-contain flex-shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <LeafMark className="flex-shrink-0" />
      )}
      <span className="text-white text-sm font-medium truncate">{name || 'CasaZero'}</span>
      {children}
    </div>
  )
}
