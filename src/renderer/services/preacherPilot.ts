// Pilot kaznodziei: telefon (strona kns-nabo.netlify.app/pilot?k=…, z kodu QR przy prezentacji) przełącza slajdy
// prezentacji na rzutniku. Wszystko idzie kanałami na żywo bazy (serwer pośredniczy), więc telefon, rzutnik i Stream
// mogą być w zupełnie różnych sieciach — wystarczy internet.
//   „pilot-<klucz sesji>”: telefon → rzutnik: { t: 'hello' | 'cmd', c: 'next' | 'prev' | 'black' };
//                          rzutnik → telefon: { t: 'state', title, n, total, hidden, img, next } (podgląd: małe JPEG).
//   „slajdy-<klucz napisów>”: rzutnik → Stream: { t: 'slide', name, n, total }; Stream → rzutnik: { t: 'hello' }.
// Klucz sesji pilota jest nowy przy każdym uruchomieniu aplikacji — stary kod QR przestaje działać.
// Stream przestawia prezentację o tej samej nazwie w swojej bibliotece — ten sam numer slajdu dla pełnego kadru i PIP.
import { reactive, watch } from 'vue'
import { hidden, items, label, liveChannel, liveItem, settings, stepBy, toggleHidden, uid, video, view } from '@/stores'
import { studio } from '@/services/studio'
import { lyricsKey } from '@/services/lyricsFeed'

export const PILOT_PAGE = 'https://kns-nabo.netlify.app/pilot?k='
export const pilot = reactive({ key: '', url: '', on: false, phones: 0, seen: 0 })

const mediaUrl = p => (/^https?:\/\//.test(p) ? p : 'media://local/' + encodeURIComponent(p))
// prezentacja (pętla bez automatu) na rzutniku
const deck = () => { const it = liveItem.value; return it?.type === 'scene' && it.auto === false ? it : null }
function deckState() {
  const d = deck()
  if (!d) return null
  const slides = view(d).slides
  if (!slides.length) return null
  const i = (video.value.step || 0) % slides.length
  return { d, slides, i }
}

// podgląd slajdu dla telefonu: mały JPEG (kanał na żywo ma limit wielkości wiadomości)
const thumbs = new Map()
function thumb(path): Promise<string> {
  if (!path) return Promise.resolve('')
  if (!thumbs.has(path)) thumbs.set(path, new Promise(resolve => {
    const im = new Image()
    im.crossOrigin = 'anonymous' // bez tego obraz z media:// „brudzi” płótno i miniatury nie da się zapisać (czarny podgląd w telefonie)
    im.onload = () => {
      const w = 480, h = Math.round(w * im.naturalHeight / Math.max(1, im.naturalWidth))
      const c = document.createElement('canvas'); c.width = w; c.height = Math.min(h, 640)
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
      try { resolve(c.toDataURL('image/jpeg', 0.6)) } catch { resolve('') }
    }
    im.onerror = () => resolve('')
    im.src = mediaUrl(path)
  }))
  return thumbs.get(path)
}

/* ---------- telefon kaznodziei ---------- */
let phone = null
async function sendPhone() {
  if (!phone) return
  const s = deckState()
  if (!s) { phone.send({ t: 'state', title: '', n: 0, total: 0, hidden: hidden.value }); return }
  const [img, next] = await Promise.all([thumb(s.slides[s.i]?.path), thumb(s.slides[s.i + 1]?.path)])
  phone.send({ t: 'state', title: label(s.d), n: s.i + 1, total: s.slides.length, hidden: hidden.value, img, next })
}
function onPhone(m) {
  pilot.seen = Date.now()
  if (m.t === 'hello') { pilot.phones = 1; sendPhone(); return }
  if (m.t !== 'cmd' || !deck()) { sendPhone(); return }
  if (m.c === 'next') stepBy(1)
  else if (m.c === 'prev') stepBy(-1)
  else if (m.c === 'black') toggleHidden()
}
// kod QR pokazany pierwszy raz — otwieramy kanał (potem zostaje do końca pracy aplikacji)
export function openPilot() {
  if (phone) return
  pilot.on = true
  phone = liveChannel('pilot', pilot.key, onPhone)
}

/* ---------- Stream (numer slajdu) ---------- */
let toStream = null, toStreamKey = ''
const slideMsg = () => { const s = deckState(); return s ? { t: 'slide', name: label(s.d), n: s.i + 1, total: s.slides.length } : null }
function sendStream() {
  const m = slideMsg()
  if (!m) return
  followSlide(m) // Stream w tej samej aplikacji — od razu
  if (!toStream && toStreamKey) toStream = liveChannel('slajdy', toStreamKey, onStreamMsg) // baza gotowa dopiero teraz
  toStream?.send(m)
}
const onStreamMsg = m => { if (m?.t === 'hello') sendStream() }

/* ---------- Stream: odbiór i przestawienie tej samej prezentacji ---------- */
const norm = s => String(s || '').trim().toLowerCase()
export function followSlide(m) {
  if (m?.t !== 'slide' || !m.name) return
  const decks = items.value.filter(it => it.type === 'scene' && norm(it.name) === norm(m.name))
  if (!decks.length) return
  const next = { ...studio.mplay.slides }
  for (const d of decks) next[d.id] = Math.max(0, (+m.n || 1) - 1)
  studio.mplay.slides = next // wspólne dla podglądu i wizji — pełny kadr i PIP
}
let fromProjector = null, fromKey = ''

let started = false
export function startPreacherPilot() {
  if (started) return
  started = true
  pilot.key = (uid() + uid()).replace(/[^\w]/g, '').slice(0, 20)
  pilot.url = PILOT_PAGE + pilot.key
  // rzutnik: każdy nowy slajd / ukrycie → telefon i Stream
  watch([() => deck()?.id, () => video.value.step, hidden], () => { sendPhone(); sendStream() })
  // kanał do Stream na innym komputerze — gdy rzutnik ma klucz napisów (Ustawienia aplikacji → Dla streamu)
  watch(() => settings.lyricsKey, key => {
    if (key === toStreamKey) return
    toStream?.close(); toStream = null; toStreamKey = key || ''
    if (key) toStream = liveChannel('slajdy', key, onStreamMsg)
  }, { immediate: true })
  // Stream: rzutnik na innym komputerze (ten sam klucz co napisy) — prezentacja idzie za slajdami kaznodziei
  watch([() => settings.streamLyrics, lyricsKey], ([mode, key]) => {
    const want = mode === 'remote' && key && key !== settings.lyricsKey ? key : ''
    if (want === fromKey) return
    fromProjector?.close(); fromProjector = null; fromKey = want
    if (want) { fromProjector = liveChannel('slajdy', want, followSlide); fromProjector?.send({ t: 'hello' }) }
  }, { immediate: true })
  // baza mogła nie być gotowa przy starcie — ponawiamy połączenie ze Streamem / z rzutnikiem
  setInterval(() => {
    if (!toStream && toStreamKey) toStream = liveChannel('slajdy', toStreamKey, onStreamMsg)
    if (!fromProjector && fromKey) { fromProjector = liveChannel('slajdy', fromKey, followSlide); fromProjector?.send({ t: 'hello' }) }
  }, 10000)
}
