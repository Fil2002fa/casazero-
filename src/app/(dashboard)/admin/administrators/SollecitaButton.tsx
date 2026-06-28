'use client'

import { useState } from 'react'
import { Bell, Clock } from 'lucide-react'

export function SollecitaButton() {
  const [fired, setFired] = useState(false)

  function handleClick() {
    if (fired) return
    setFired(true)
    setTimeout(() => setFired(false), 2500)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-3 py-2 bg-[#04342C] text-white rounded-lg text-sm font-medium hover:bg-[#04342C]/90 transition-colors"
    >
      {fired
        ? <Clock className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.6} />
        : <Bell className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.6} />
      }
      {fired ? 'Funzione in arrivo' : 'Sollecita'}
    </button>
  )
}
