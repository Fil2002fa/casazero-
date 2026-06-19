const CACHE = 'casazero-v2'
const PRECACHE = ['/offline.html']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Mai intercettare gli internals di Next.js: i chunk cambiano hash a ogni build
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  ) return

  // Network-first per la navigazione (HTML): garantisce HTML fresco,
  // fallback su cache o offline.html solo se la rete è irraggiungibile
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
          return res
        })
        .catch(() =>
          caches.match(e.request).then((cached) => cached ?? caches.match('/offline.html'))
        )
    )
    return
  }

  // Cache-first per risorse statiche proprie (icone, manifest, offline.html)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => caches.match('/offline.html'))
    })
  )
})
