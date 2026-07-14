'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { CONTENT_GRID } from '@/lib/layout'

interface BuilderIdentityBarProps {
  name: string
  logoSrc: string | null
  className?: string
  children?: React.ReactNode
}

// Identità del costruttore in cima alla shell dashboard. Sostituisce la striscia
// verde piena: era l'elemento più prominente della pagina pur non essendo né
// un'azione né uno stato, e vinceva sul titolo. Qui è chrome silenzioso — fondo
// neutro, testo di sistema — e il titolo di pagina torna a dominare.
//
// La barra è a tutta larghezza (fondo + bordo), ma il suo contenuto sta sulla
// stessa CONTENT_GRID del contenuto delle pagine: il logo del costruttore cade
// esattamente sopra il titolo di pagina invece di galleggiare su una griglia propria.
// L'altezza h-14 è la stessa del blocco marchio nella sidebar, così i due marchi
// (CasaZero e costruttore) poggiano sulla stessa linea di base.
//
// Stesso componente nell'header reale ((dashboard)/layout.tsx) e nell'anteprima di
// Impostazioni → Identità (IdentityTab.tsx): l'anteprima "così appare nell'header"
// mostra letteralmente l'header, non una sua imitazione.
//
// Fallback silenzioso: se il costruttore non ha un logo, o se l'URL fallisce (es.
// logo_url che punta a un bucket privato e risponde 400), non si mostra alcuna icona
// sostitutiva — resta il solo nome, con la stessa tipografia. Nessuna icona rotta e
// nessun marchio CasaZero al posto di quello del costruttore. Il logo compare appena
// esiste e carica: è il punto del whitelabel.
export function BuilderIdentityBar({ name, logoSrc, className, children }: BuilderIdentityBarProps) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => { setImgError(false) }, [logoSrc])

  const showLogo = logoSrc !== null && !imgError

  return (
    <div className={cn('bg-surface border-b border-border', className)}>
      <div className={cn(CONTENT_GRID, 'h-14 flex items-center gap-2')}>
        {showLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            className="w-5 h-5 object-contain flex-shrink-0"
            onError={() => setImgError(true)}
          />
        )}
        <span className="text-sm font-medium text-text-primary truncate">{name || 'CasaZero'}</span>
        {children}
      </div>
    </div>
  )
}
