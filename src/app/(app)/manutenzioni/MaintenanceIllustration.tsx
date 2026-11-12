'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { MaintenanceIllustrationAsset } from './maintenance-illustrations'

export function MaintenanceIllustration({ asset }: { asset?: MaintenanceIllustrationAsset }) {
  if (!asset || !asset.src.trim() || !asset.alt.trim() || asset.width <= 0 || asset.height <= 0) return null
  return <LoadedIllustration key={asset.src} asset={asset} />
}

function LoadedIllustration({ asset }: { asset: MaintenanceIllustrationAsset }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  if (status === 'failed') return null

  return (
    <figure className={status === 'loaded' ? 'mt-4 min-w-0' : 'hidden'}>
      <Image
        src={asset.src}
        alt={asset.alt}
        width={asset.width}
        height={asset.height}
        sizes="(max-width: 512px) calc(100vw - 80px), 432px"
        className="h-auto max-h-44 w-full rounded-xl object-contain"
        loading="eager"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
      <figcaption className="mt-2 text-xs leading-relaxed text-text-secondary">Illustrazione divulgativa</figcaption>
    </figure>
  )
}
