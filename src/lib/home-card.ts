// Piccole regole pure della card residenza della home (nessun React, nessuna query).
import { formatDateIT } from './formatDate'

/** Iniziali del nome residenza: prime lettere delle prime due parole ("Residenza Magnolia" → "RM"). */
export function residenceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map(w => Array.from(w)[0]?.toUpperCase() ?? '')
  return letters.join('') || 'CZ'
}

/** Foto usabile: solo un URL http(s) ben formato, altrimenti si usano le iniziali. */
export function usablePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export type DeliveryChip = { tone: 'done' | 'pending'; text: string }

/** Chip consegna: data nulla = non ancora consegnata (units.delivery_date, 041). */
export function deliveryChip(deliveryDate: string | null | undefined, today: string): DeliveryChip {
  if (!deliveryDate) return { tone: 'pending', text: 'In attesa di consegna' }
  const d = deliveryDate.slice(0, 10)
  return d <= today
    ? { tone: 'done', text: `Consegnata il ${formatDateIT(d)}` }
    : { tone: 'pending', text: `Consegna prevista il ${formatDateIT(d)}` }
}
