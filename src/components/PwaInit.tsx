'use client'

import { useEffect } from 'react'

export default function PwaInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    } else {
      // In dev: disinstalla qualsiasi SW residuo per evitare che intercetti i chunk
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister())
      })
    }
  }, [])

  return null
}
