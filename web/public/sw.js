// Pozwala zainstalować stronę jako aplikację i otworzyć ją bez zasięgu — i szybko przy słabym zasięgu:
// • kod i style (assets/* — skrót treści w nazwie, nigdy się nie zmieniają) i czcionki Google — z kopii, bez sieci;
// • strona (index.html) — z sieci, ale gdy sieć nie odpowie w 1,2 s, od razu z kopii (nowa wersja przyjdzie
//   w tle, a aplikacja sama zaproponuje odświeżenie — utils/updateCheck);
// • reszta plików strony — z sieci, bez internetu z kopii.
// Dane (Dysk Google, baza Supabase) nigdy nie są tu zapisywane — zawsze idą prosto do źródła.
const CACHE = 'kns-nabo-v225'
const SHELL = ['./', './index.html', './swit.svg', './pole.svg', './jezioro.svg', './noc.svg', './papier.svg', './manifest.webmanifest', './logo.png', './znak.png', './icon-192.png', './icon-512.png', './badge.png', './favicon.png', './maskable-192.png', './maskable-512.png']
const LIBRARY = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//
const HTML_WAIT = 1200

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

const save = (request, res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)) } return res }
// z kopii, a bez niej z sieci (i do kopii)
const cacheFirst = request => caches.match(request).then(hit => hit || fetch(request).then(res => save(request, res)))

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return // funkcje serwera — zawsze na żywo
  // biblioteki i czcionki (wersja w adresie) — wystarczy raz pobrać
  if (LIBRARY.test(request.url)) { event.respondWith(cacheFirst(request)); return }
  if (url.origin !== location.origin) return // Google (logowanie, Dysk) — bez pośrednictwa
  if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(request)); return }
  // strona: sieć, ale najwyżej 1,2 s czekania, gdy jest kopia
  if (request.mode === 'navigate') {
    const net = fetch(request).then(res => save('./index.html', res))
    event.respondWith(caches.match('./index.html').then(hit => {
      if (!hit) return net
      return Promise.race([net.catch(() => hit), new Promise(r => setTimeout(() => r(hit), HTML_WAIT))])
    }))
    event.waitUntil(net.catch(() => {}))
    return
  }
  event.respondWith(fetch(request).then(res => save(request, res)).catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))))
})

// Powiadomienie z serwera (przypomnienie o brakach w nabożeństwie).
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  // sygnał kamery: własny znacznik (nowy podmienia poprzedni), wibracja według stanu (spóźnione odrzuca już serwer — ważność 30 s)
  event.waitUntil(self.registration.showNotification(data.title || 'Nabożeństwa', {
    body: data.body || '', icon: 'icon-192.png', badge: 'badge.png', tag: data.tag || 'kns-przypomnienie', renotify: true, data: { url: data.url || './' },
    ...(data.vibrate ? { vibrate: data.vibrate } : {}), ...(data.cue === 'live' ? { requireInteraction: true } : {}),
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
