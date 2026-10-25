// Pozwala zainstalować stronę jako aplikację i otworzyć ją bez zasięgu (z ostatnio pobranej wersji).
// Pliki strony: najpierw sieć (żeby zawsze była najnowsza wersja), a bez internetu — kopia.
// Dane (Dysk Google, baza Supabase) nigdy nie są tu zapisywane — zawsze idą prosto do źródła.
const CACHE = 'kns-nabo-v166'
// Kod i style strony (assets/*) mają w nazwie skrót treści — zapisują się do kopii przy pierwszym wczytaniu.
const SHELL = ['./', './index.html', './swit.svg', './pole.svg', './jezioro.svg', './noc.svg', './papier.svg', './manifest.webmanifest', './logo.png', './znak.png', './icon-192.png', './icon-512.png', './badge.png', './favicon.png', './maskable-192.png', './maskable-512.png']
const LIBRARY = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//

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
  if (url.pathname.startsWith('/api/')) return // funkcje serwera — zawsze na żywo
  // Biblioteka Vue: wersja w adresie się nie zmienia, więc wystarczy raz ją pobrać.
  if (LIBRARY.test(request.url)) {
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

// Powiadomienie z serwera (przypomnienie o brakach w nabożeństwie).
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'Nabożeństwa', {
    body: data.body || '', icon: 'icon-192.png', badge: 'badge.png', tag: 'kns-przypomnienie', renotify: true, data: { url: data.url || './' },
  }))
})
// Dotknięcie powiadomienia otwiera aplikację (albo przełącza na już otwartą).
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope))
    return open ? open.focus().then(c => c.navigate?.(target) || c) : self.clients.openWindow(target)
  }))
})
