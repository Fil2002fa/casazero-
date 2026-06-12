const CACHE = 'casazero-v1'
const PRECACHE = ['/', '/offline.html']

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
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  // Non cachare chiamate API o auth
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/api')) return

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            caches.open(CACHE).then((c) => c.put(e.request, res.clone()))
          }
          return res
        })
        .catch(() => caches.match('/offline.html'))
    })
  )
})
