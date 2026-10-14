// Pozwala zainstalować stronę jako aplikację i otworzyć ją bez zasięgu (z ostatnio pobranej wersji).
// Pliki strony: najpierw sieć (żeby zawsze była najnowsza wersja), a bez internetu — kopia.
// Dane z Dysku Google nigdy nie są tu zapisywane — zawsze idą prosto do Google.
const CACHE = 'kns-nabozenstwa-v6'
const SHELL = ['./', './index.html', './drive.js', './config.js', './manifest.webmanifest', './logo.png', './znak.png', './icon-192.png', './icon-512.png']
const LIBRARY = 'https://cdnjs.cloudflare.com/'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Biblioteka Vue: wersja w adresie się nie zmienia, więc wystarczy raz ją pobrać.
  if (request.url.startsWith(LIBRARY)) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(res => {
      const copy = res.clone()
      caches.open(CACHE).then(cache => cache.put(request, copy))
      return res
    })))
    return
  }
  if (url.origin !== location.origin) return // Google (logowanie, Dysk) — bez pośrednictwa
  event.respondWith(fetch(request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)) }
    return res
  }).catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))))
})
