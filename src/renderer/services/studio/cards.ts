// Plansze: ogłoszenia w pętli (grafiki, karty z tekstem, karta najbliższego nabożeństwa), odliczanie
// w stylu grafik ogłoszeń (papier, fala, timer), plansza końcowa z kodami QR.
import qrcode from 'qrcode-generator'
import { currentAnnouncements, nearestService, projectorGraphics, servicePlace, serviceTime, sortedServices, today } from '@/stores'
import type { StudioSlide } from '@/types'
import { H, W, studio } from './state'
import { S, background, fit, fitLine, g, img, luminance, paintOn, rounded, text, trimmed, withOutline, wrap } from './paint'
import { mediaSlide, mediaUrl } from './media'
import { BACKGROUNDS, BG_IDS } from './backgrounds'
import { drawCamera } from './camera'
import { MOODS, drawPeak, isMood } from './peak'
import { drawSketch, dust } from './rough'
import { CLEAN, cleanBackground, hasBlock, isClean } from './clean'
import { settings } from '@/stores'

let slideBase = 0
export const svcWhen = svc => (svc ? new Date(svc.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + serviceTime(svc) : '')
// Slajdy ogłoszeń (zaznaczone „Pokaż na nabożeństwie”, tylko „dla wszystkich” — transmisja jest publiczna):
// najpierw grafiki, potem ogłoszenia bez grafiki jako karty z tekstem, na końcu (jeśli włączona) karta nabożeństwa.
export function slideCandidates(): StudioSlide[] {
  const pub = currentAnnouncements.value.filter(a => a.projector && (a.audience || 'public') === 'public')
  return [
    { id: 'sermon', title: 'Kazanie i kaznodzieja', sermon: true },
    ...pub.filter(a => a.image).map(a => ({ id: 'a' + a.id, title: a.title, image: a.image })),
    ...projectorGraphics.value.filter(x => x.key.startsWith('e')).map(x => ({ id: x.key, title: x.name, image: x.image })),
    ...pub.filter(a => !a.image).map(a => ({ id: 'a' + a.id, title: a.title, text: a.text || '' })),
    { id: 'svc', title: 'Najbliższe nabożeństwo', service: true },
  ]
}
// kilka ogłoszeń naraz, zaczynając od bieżącego (ramka „Życie kościoła”)
export function carouselStack(t, count) {
  const list = slides()
  if (!list.length) return []
  const every = Math.max(3, +studio.slideEvery || 8) * 1000, i = Math.floor(Math.max(0, t - slideBase) / every)
  return Array.from({ length: Math.min(count, list.length) }, (_, n) => list[(i + n) % list.length])
}
// karta kazania: gdy w planie jest co pokazać; nie w Życiu kościoła — to czas po nabożeństwie
export const hasSermon = () => { const n = nearestService.value; return !!(n?.sermonTitle || n?.passage || n?.speaker) }
export function slides(life = S?.scene === 'life') {
  return slideCandidates().filter(c => !studio.hidden.includes(c.id) && (!c.sermon || (!life && hasSermon())))
    .map(c => (c.image ? (img(c.image) ? { ...c, im: img(c.image) } : null) : c)).filter(Boolean)
}
export function carousel(t) {
  const list = slides()
  if (!list.length) return null
  const every = Math.max(3, +studio.slideEvery || 8) * 1000, d = Math.max(0, t - slideBase)
  const i = Math.floor(d / every) % list.length, k = (d % every) / 600
  if (S === studio.program && studio.slideId !== list[i].id) studio.slideId = list[i].id
  return { cur: list[i], prev: list[(i - 1 + list.length) % list.length], mix: list.length > 1 ? Math.min(1, k) : 1 }
}
// Kliknięcie ogłoszenia na pulpicie: od razu ono, potem dalej po kolei.
export function showSlide(id) {
  const list = slides(false), idx = list.findIndex(x => x.id === id) // kliknięcie przychodzi spoza rysowania
  if (idx < 0) return
  const every = Math.max(3, +studio.slideEvery || 8) * 1000
  slideBase = performance.now() - idx * every - 600
}
// Ogłoszenie bez grafiki: pomarańczowa karta jak grafiki ogłoszeń — tytuł i treść.
export function textSlide(sl, x, y, w, h) {
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#f0a24f'); gr.addColorStop(1, '#dc7a3c')
  g.fillStyle = gr; g.fillRect(x, y, w, h)
  const k = w / 1240, pad = 90 * k
  const tl = wrap(sl.title, w - pad * 2, Math.round(84 * k), 800, 2)
  const bl = wrap(sl.text, w - pad * 2, Math.round(42 * k), 500, 5)
  const th = tl.length * 96 * k, bh = bl.length * 56 * k, gap = bl.length ? 40 * k : 0
  let cy = y + (h - th - gap - bh) / 2 + 76 * k
  tl.forEach(l => { text(l, x + w / 2, cy, { size: Math.round(84 * k), weight: 800, color: '#2a1a10', align: 'center' }); cy += 96 * k })
  cy += gap - 20 * k
  bl.forEach(l => { text(l, x + w / 2, cy + 20 * k, { size: Math.round(42 * k), weight: 500, color: '#2a1a10', align: 'center' }); cy += 56 * k })
}
// ogłoszenia mają swoje grafiki — obwódka napisów planszy ich nie dotyczy
export const drawSlide = (sl, x, y, w, h) => withOutline('', () => slideOn(sl, x, y, w, h))
function slideOn(sl, x, y, w, h) {
  if (sl.im) fit(sl.im, sl.im.naturalWidth, sl.im.naturalHeight, x, y, w, h, 'cover')
  else if (sl.sermon) sermonCard(x, y, w, h)
  else if (sl.service) serviceCard(x, y, w, h)
  else textSlide(sl, x, y, w, h)
}
// Następne nabożeństwo, które się jeszcze NIE zaczęło (dzisiejsze po godzinie rozpoczęcia już nie).
export function upcomingService() {
  const now = Date.now()
  return [...sortedServices.value].reverse().find(s => s.date && new Date(`${s.date}T${serviceTime(s)}`).getTime() > now) || null
}
// Tło kart nabożeństwa i kazania: ciemne, z prawej słońce i góry z logo kościoła.
function darkCard(x, y, w, h) {
  const k = w / 1240, look = cdLook().accent || '#f6a836', accent = luminance(look) < 0.25 ? '#f6a836' : look // ciemny akcent zniknąłby na ciemnej karcie
  const back = g.createLinearGradient(x, y, x + w, y + h); back.addColorStop(0, '#2a1b11'); back.addColorStop(1, '#120c07')
  g.fillStyle = back; g.fillRect(x, y, w, h)
  const cx = x + w * 0.74, cy = y + h * 0.47, r = h * 0.42, sun = g.createLinearGradient(0, cy - r, 0, cy + r)
  sun.addColorStop(0, accent); sun.addColorStop(1, '#a2471a')
  g.fillStyle = sun; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill()
  const ridge: [number, number][] = [[0.44, 1], [0.55, 0.74], [0.62, 0.82], [0.74, 0.62], [0.86, 0.8], [0.93, 0.72], [1, 0.8], [1, 1]]
  g.fillStyle = '#0d0805'; g.beginPath(); ridge.forEach(([px, py], i) => (i ? g.lineTo(x + w * px, y + h * py) : g.moveTo(x + w * px, y + h * py))); g.closePath(); g.fill()
  return { k, accent, cx, cy, r }
}
function sunLogo(cx, cy, r) {
  const lg = img('./znak-obrys.png'), ls = r * 1.05
  g.save(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, ls * 0.62, 0, Math.PI * 2); g.fill(); g.restore()
  if (lg) g.drawImage(lg, cx - ls / 2, cy - ls / 2, ls, ls)
}
// Karta najbliższego nabożeństwa: z lewej dzień, godzina i miejsce, pod spodem kazanie; z prawej logo na słońcu.
export function serviceCard(x, y, w, h) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip()
  const k = w / 1240, look = cdLook(), accent = luminance(look.accent || '#f6a836') < 0.25 ? '#f6a836' : look.accent || '#f6a836', svc = upcomingService()
  // góra z tła aplikacji (motyw z odliczania), z lewej przyciemniona pod napisy
  const zoom = Math.max(w / W, h / H)
  g.save(); g.translate(x + (w - W * zoom) / 2, y + (h - H * zoom) / 2); g.scale(zoom, zoom); drawPeak(isMood(look.bg) && look.bg !== 'czern' ? look.bg : 'szczyt'); g.restore()
  const veil = g.createLinearGradient(x, 0, x + w * 0.74, 0); veil.addColorStop(0, 'rgba(14,8,4,0.92)'); veil.addColorStop(0.62, 'rgba(14,8,4,0.74)'); veil.addColorStop(1, 'rgba(14,8,4,0)')
  g.fillStyle = veil; g.fillRect(x, y, w, h)
  const lr = 54 * k, lg = img('./znak-obrys.png'), lx = x + w - lr - 40 * k, ly = y + h - lr - 40 * k
  g.fillStyle = '#fff'; g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI * 2); g.fill()
  if (lg) g.drawImage(lg, lx - lr * 0.8, ly - lr * 0.8, lr * 1.6, lr * 1.6)
  const tx = x + 76 * k, tw = w * 0.5
  const day = svc ? new Date(svc.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase()) : 'Termin wkrótce'
  const size = Math.round(84 * k), lines = wrap(day.replace(', ', ',\n'), tw, size, 400, 2, 'display'), lh = size * 1.14
  const where = svc ? wrap('godz. ' + serviceTime(svc) + ' · ' + servicePlace(svc), tw, Math.round(40 * k), 600, 2, 'sans') : wrap('Szczegóły na kns-nabo.netlify.app', tw, Math.round(34 * k), 600, 2, 'sans')
  const sermon = svc?.sermonTitle || '', more = svc ? [svc.passage, svc.speaker].filter(Boolean).join(' · ') : ''
  const head = 46 * k, whereH = where.length * 52 * k, sermonH = sermon || more ? 34 * k + (sermon ? 60 * k : 0) + (more ? 50 * k : 0) : 0
  let ty = y + (h - head - lines.length * lh - whereH - sermonH) / 2 + 24 * k
  const eye = fitLine('NAJBLIŻSZE NABOŻEŃSTWO', tw, Math.round(40 * k), Math.round(26 * k), 700, 'cond')
  text(eye.str, tx, ty, { size: eye.size, weight: 700, font: 'cond', color: accent, spacing: 5 * k })
  ty += head
  lines.forEach((l, i) => text(l, tx, ty + (i + 0.82) * lh, { size, weight: 400, font: 'display', color: '#fbf3e6' }))
  ty += lines.length * lh
  where.forEach((l, i) => text(l, tx, ty + 42 * k + i * 52 * k, { size: Math.round((svc ? 40 : 34) * k), weight: 600, font: 'sans', color: '#fbf3e6' }))
  ty += whereH
  if (sermon || more) {
    g.fillStyle = accent; g.fillRect(tx, ty + 20 * k, 72 * k, 5 * k); ty += 34 * k
    if (sermon) { const t = fitLine('„' + sermon + '”', tw, Math.round(44 * k), Math.round(28 * k), 400, 'serif', true); text(t.str, tx, ty + 46 * k, { size: t.size, weight: 400, font: 'serif', italic: true, color: accent }); ty += 60 * k }
    if (more) { const m = fitLine(more, tw, Math.round(36 * k), Math.round(26 * k), 600, 'sans'); text(m.str, tx, ty + 38 * k, { size: m.size, weight: 600, font: 'sans', color: '#fbf3e6' }) }
  }
  g.restore()
}
// Karta kazania: z prawej kaznodzieja na tle słońca i gór z logo kościoła, z lewej tytuł, fragment i imię.
function sermonCard(x, y, w, h) {
  const n = nearestService.value
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip()
  const { k, accent, cx, cy, r } = darkCard(x, y, w, h)
  const it = mediaSlide(speakerPic(n?.speaker)), pic = it?.type === 'image' && img(mediaUrl(it.path))
  if (pic) {
    const box = trimmed(pic), s = Math.min(w * 0.46 / box.w, h * 0.92 / box.h), pw = box.w * s, ph = box.h * s
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 30 * k
    g.drawImage(pic, box.x, box.y, box.w, box.h, cx - pw / 2, y + h - ph, pw, ph); g.restore()
  } else sunLogo(cx, cy, r)
  const when = n?.date === today() ? 'DZIŚ KAZANIE' : 'KAZANIE · ' + new Date(n.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
  const main = n.sermonTitle || n.passage || n.speaker, verse = n.sermonTitle ? n.passage : '', who = main === n.speaker ? '' : n.speaker
  const tx = x + 76 * k, tw = w * 0.45, sizes = [86, 74, 62, 52].map(v => Math.round(v * k))
  const size = sizes.find(v => !wrap(main, tw, v, 400, 3, 'display').at(-1).endsWith('…')) || sizes[3], lines = wrap(main, tw, size, 400, 4, 'display'), lh = size * 1.14
  const head = 46 * k, verseH = verse ? 66 * k : 0, whoH = who ? 112 * k : 0
  let ty = y + (h - head - lines.length * lh - verseH - whoH) / 2 + 24 * k
  const eye = fitLine(when, tw, Math.round(40 * k), Math.round(26 * k), 700, 'cond')
  text(eye.str, tx, ty, { size: eye.size, weight: 700, font: 'cond', color: accent, spacing: 5 * k })
  ty += head
  lines.forEach((l, i) => text(l, tx, ty + (i + 0.82) * lh, { size, weight: 400, font: 'display', color: '#fbf3e6' }))
  ty += lines.length * lh
  if (verse) { const f = fitLine(verse, tw, Math.round(44 * k), Math.round(28 * k), 400, 'serif', true); text(f.str, tx, ty + 50 * k, { size: f.size, weight: 400, font: 'serif', italic: true, color: accent }); ty += verseH }
  if (who) {
    g.fillStyle = accent; g.fillRect(tx, ty + 34 * k, 72 * k, 5 * k)
    const f = fitLine(who, tw, Math.round(48 * k), Math.round(30 * k), 700, 'sans'); text(f.str, tx, ty + 100 * k, { size: f.size, weight: 700, font: 'sans', color: '#fbf3e6' })
  }
  g.restore()
}
export const drawCarousel = (c, x, y, w, h) => withOutline('', () => carouselOn(c, x, y, w, h))
function carouselOn(c, x, y, w, h) {
  drawSlide(c.prev, x, y, w, h)
  if (c.mix < 1) { g.save(); g.globalAlpha = c.mix; drawSlide(c.cur, x, y, w, h); g.restore() } else drawSlide(c.cur, x, y, w, h)
}
// Kod QR rysowany na płótnie (macierz liczona raz dla danego tekstu).
export const qrCache = new Map()
export function qr(str, x, y, size) {
  let m = qrCache.get(str)
  if (!m) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']
    const c = qrcode(0, 'M'); c.addData(str); c.make()
    const n = c.getModuleCount()
    m = { n, dark: Array.from({ length: n * n }, (_, i) => c.isDark(Math.floor(i / n), i % n)) }
    qrCache.set(str, m)
  }
  const cell = Math.floor(size / (m.n + 2)), off = (size - cell * m.n) / 2
  g.fillStyle = '#fff'; g.fillRect(x, y, size, size)
  g.fillStyle = '#2b2b2b'
  for (let i = 0; i < m.dark.length; i++) if (m.dark[i]) g.fillRect(x + off + (i % m.n) * cell, y + off + Math.floor(i / m.n) * cell, cell, cell)
}
// Kod QR przelewu (standard banków w Polsce: aplikacja banku po zeskanowaniu wypełnia przelew).
export function bankQr(e) {
  const acct = String(e.account || '').replace(/\D/g, '')
  if (acct.length !== 26) return ''
  const clean = v => String(v || '').replace(/\|/g, ' ').trim()
  return `|PL|${acct}|000000|${clean(e.name).slice(0, 20)}|${clean(e.title).slice(0, 32)}|||`
}

/* ---------- styl grafik ogłoszeń: pogniecony papier, karta, logo u dołu ---------- */
export const CARD = { x: 80, y: 80, w: W - 160, h: H - 175 }
let paperCanvas: HTMLCanvasElement = null
export function paper() {
  if (!paperCanvas) {
    // raz: jasny papier z delikatnymi „zagnieceniami” i ziarnem
    paperCanvas = document.createElement('canvas'); paperCanvas.width = W; paperCanvas.height = H
    const p = paperCanvas.getContext('2d')
    p.fillStyle = '#efece6'; p.fillRect(0, 0, W, H)
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 70; i++) {
      p.beginPath()
      const x = rnd() * W, y = rnd() * H
      p.moveTo(x, y)
      for (let k = 0; k < 3; k++) p.lineTo(x + (rnd() - 0.5) * 900, y + (rnd() - 0.5) * 700)
      p.closePath()
      p.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,110,95,0.045)'
      p.fill()
    }
    const im = p.getImageData(0, 0, W, H), d = im.data
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    p.putImageData(im, 0, 0)
  }
  g.drawImage(paperCanvas, 0, 0)
}
// Fala u góry: dwie warstwy (ciemniejsza pod spodem) z falującą dolną krawędzią.
export function topWave() {
  const wave = (base, amp, len, phase, color) => {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0)
    for (let x = W; x >= 0; x -= 20) g.lineTo(x, base + amp * Math.sin((x / len) * Math.PI * 2 + phase))
    g.closePath(); g.fillStyle = color; g.fill()
  }
  wave(250, 26, 760, 1.2, '#e8952f')
  wave(222, 22, 640, 0, '#f6a836')
}
export function countdownLeft() {
  const svc = nearestService.value
  const start = studio.countdownTo || (svc ? new Date(`${svc.date}T${serviceTime(svc)}`).getTime() : 0)
  return Math.max(0, Math.ceil((start - Date.now()) / 1000))
}
// Odliczanie: minuty od teraz (np. 10) albo 0 — do godziny nabożeństwa.
export function setCountdown(minutes) { studio.countdownTo = minutes ? Date.now() + minutes * 60000 : 0; armed = false }
export function addCountdown(minutes) { studio.countdownTo = Math.max(Date.now(), studio.countdownTo || Date.now()) + minutes * 60000 }
export let armed = false, zeroAt = 0
export function setArmed(v: boolean, at = 0) { armed = v; zeroAt = at }
// Wygląd „Odliczania” (Studio → Scena): domyślnie papier z falą i ogłoszeniami w środku.
export const CD_DEFAULT = { bg: 'szczyt', draw: true, c1: '#1d2a44', c2: '#e8952f', image: '', dim: 0, title: 'ZACZYNAMY ZA', done: 'ZARAZ ZACZYNAMY', sub: '', brand: 'KOŚCIÓŁ NA SKALE', foot: '{nabożeństwo}', layout: 'rock', timer: 'plain', accent: '#f6a836', show: 'ann', photo: '' } as const
// tło spoza listy (np. dawne „Ciemne” albo „Góry”) — Szczyt
const safeBg = L => (BG_IDS.includes(L.bg) ? L : { ...L, bg: 'szczyt' })
// wizja rysuje wygląd z chwili „Na wizję” (S.styles), podgląd — bieżące ustawienia
export const styleOf = (k: 'cd' | 'end' | 'life', live) => (S?.styles ? S.styles[k] : live)
export const cdLook = () => safeBg({ ...CD_DEFAULT, ...(styleOf('cd', settings.cdLook) || {}) })
// Wygląd „Końca”: tło jak w odliczaniu, układ (karta z kafelkami, obok siebie, duży napis), napis i podpis.
export const END_DEFAULT = { bg: 'szczyt', draw: true, c1: '#1d2a44', c2: '#e8952f', image: '', dim: 0, title: 'DZIĘKUJEMY, ŻE BYLIŚCIE Z NAMI', sub: 'Do zobaczenia: {nabożeństwo}', brand: 'KOŚCIÓŁ NA SKALE', layout: 'rock', pic: '' } as const
export const endLook = () => safeBg({ ...END_DEFAULT, ...(styleOf('end', settings.endLook) || {}) })
// Ramka sceny „Życie kościoła”: tło jak w planszach, napisy, ogłoszenia, wydarzenia i kod QR.
export const LIFE_DEFAULT = { bg: 'szczyt', draw: false, c1: '#1d2a44', c2: '#e8952f', image: '', dim: 0, layout: 'side', banner: true, title: 'Życie kościoła', brand: 'KOŚCIÓŁ NA SKALE', ann: true, events: true, qr: 'bank', link: '' } as const
export const lifeLook = () => safeBg({ ...LIFE_DEFAULT, ...(styleOf('life', settings.lifeLook) || {}) })
// Pasek mówcy: {mówca} i {kazanie} — z najbliższego nabożeństwa; puste pole — nic.
export const LOWER_DEFAULT = { style: 'rock', name: '{mówca}', sub: '{kazanie}', color: '#f6a836', logo: true, photo: '@speaker', photoSize: 'm' } as const
// Zdjęcia mówców: imię w planie bywa krótsze niż przy zdjęciu („Piotr” i „Piotr Gruchała” to ta sama osoba).
const nameKey = n => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim()
const sameName = (a, b) => { const x = nameKey(a), y = nameKey(b); return !!x && !!y && (x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ')) }
export const photosOf = name => (settings.speakerPhotos || []).filter(p => sameName(p.name, name))
export const currentSpeaker = () => nearestService.value?.speaker || ''
// bez galerii: zdjęcie ustawione wprost w presecie paska tego mówcy — karta kazania pokazuje to samo co pasek
function presetPic(name) {
  const looks = [settings.lowerLook, ...(settings.studioPresets || []).filter(p => p.kind === 'lower').map(p => p.data)]
  return looks.find(d => d?.photo && d.photo !== '@speaker' && sameName(fill(d.name), name))?.photo || ''
}
export function speakerPic(name) { const own = photosOf(name), list = !own.length && demo ? settings.speakerPhotos || [] : own; return (list.find(p => p.on) || list[0])?.pic || presetPic(name) }
export function choosePhoto(entry) { for (const p of photosOf(entry.name)) p.on = p.id === entry.id }
// zdjęcie na pasku: stałe z presetu, wybrane zdjęcie mówcy z nabożeństwa albo żadne
const photoFor = L => (L.photo === '' ? '' : L.photo && L.photo !== '@speaker' ? L.photo : speakerPic(fill(L.name)))
export const lowerPic = L => L.pic ?? photoFor(L)
export const lowerNow = () => { const L = { ...LOWER_DEFAULT, ...(settings.lowerLook || {}) }; return { ...L, pic: photoFor(L) } }
export const lowerLookOf = () => S?.lowerLook || lowerNow()
// Baner (nakładka na Kamerze i Rzutniku): styl, kolor, napis, podpis, dopisek i kod QR.
export const BANNER_DEFAULT = { style: 'rock', color: '#f6a836', title: 'Dziękujemy, że byliście z nami!', sub: 'Do zobaczenia: {nabożeństwo}', note: '', qr: 'all', link: '', pic: '', place: 'bottom' } as const
// Banery: jeden albo kolejka kilku (slajdy w kółko co „sec” sekund). Podgląd — bieżące ustawienia; wizja — kopia z chwili
// wysłania (S.banner), więc zmiany na pulpicie widać najpierw na podglądzie, a na wizję idą po potwierdzeniu.
export const bannerSet = () => ({
  list: (settings.bannerCycle && settings.bannerQueue?.length ? settings.bannerQueue : [settings.banner || {}]).map(b => ({ ...BANNER_DEFAULT, ...b })),
  sec: Math.max(4, Math.min(120, +settings.bannerSec || 10)),
})
// podgląd: jeden baner, bez przełączania — z kolejki ten wskazany strzałkami (kolejka rusza dopiero na wizji)
export const bannerNow = () => {
  if (S?.banner) return S.banner
  const { list } = bannerSet(), i = studio.bannerPv % list.length
  return { list: [list[i < 0 ? i + list.length : i]], sec: 10, at: 0 }
}
// wizja: kopia z chwili wysłania; podgląd (i miniatury presetów przez S.prayerLook) — jak banery
export const prayerLook = () => S?.prayerLook || ({ ink: settings.prayerInk, outline: settings.prayerOutline, style: settings.prayerStyle, head: settings.prayerHead, text: settings.prayerText, sub: settings.prayerSub, link: settings.prayerLink, label: settings.prayerLinkLabel })
// banery presetu: edycja i miniatura pokazują jeden, kolejka rusza dopiero na wizji
export const presetBanners = (d, edit = false) => ((!edit && d.cycle && d.queue?.length) ? d.queue : [d.banner]).map(b => ({ ...BANNER_DEFAULT, ...b }))
const dimmed = L => { g.fillStyle = 'rgba(0,0,0,' + Math.max(0, Math.min(0.8, (L.dim ?? 45) / 100)) + ')'; g.fillRect(0, 0, W, H) }
// Pola w napisach: wstawione z nabożeństwa; gdy nie ma czego wstawić, cały napis znika. Miniatury pokazują przykład.
let demo = false
export const setDemo = (v: boolean) => { demo = v }
export function fill(str) {
  let s = String(str || ''), empty = false
  const svc = upcomingService(), near = nearestService.value
  const put = (token, value, sample) => { if (s.includes(token)) { const v = value || (demo ? sample : ''); if (!v) empty = true; s = s.split(token).join(v) } }
  put('{nabożeństwo}', svc ? svcWhen(svc) + ' · ' + servicePlace(svc) : '', 'niedziela, 10:00')
  put('{mówca}', near?.speaker, 'Imię mówcy')
  put('{kazanie}', [near?.sermonTitle, near?.passage].filter(Boolean).join(' · '), 'Tytuł kazania')
  return empty ? '' : s
}
// Rysowanie gór zaczyna się, gdy plansza wchodzi na ekran: osobny zegar dla podglądu i wizji; kopia przy przenikaniu
// i miniatury pokazują gotowy rysunek, a podgląd w Przygotowaniu (S.loop) rysuje w kółko.
const sketchSeen = new WeakMap<object, { start: number, last: number }>()
function sketchLine(L, t, color, at, cross = undefined) {
  const onAir = S === studio.program || S === studio.preview
  if (S?.loop) { drawSketch(t, false, color, at, cross, 'x'); return }
  if (demo || L.draw === false || !onAir) { drawSketch(t, true, color, at, cross); return }
  let c = sketchSeen.get(S)
  if (!c || t - c.last > 400) { c = { start: t, last: t }; sketchSeen.set(S, c) }
  c.last = t
  drawSketch(t - c.start, false, color, at, cross, S === studio.program ? 'p' : 'v')
}
// Tło planszy: namalowana góra (Szczyt, Świt, Noc, Żar), papier, szkic, góry, dwa kolory, grafika z Biblioteki albo kamera.
export function cdBackground(L, t, side = true) {
  if (isMood(L.bg)) { drawPeak(L.bg); sketchLine(L, t, MOODS[L.bg].line, MOODS[L.bg].at, MOODS[L.bg].cross); dust(t); dimmed(L); return }
  if (isClean(L.bg)) {
    const c = CLEAN[L.bg]
    const block = hasBlock(L.bg, L.layout)
    cleanBackground(L.bg, L.layout, L.ink)
    g.save(); g.globalAlpha = c.alpha // linia ma być tłem, nie treścią
    if (block) { g.beginPath(); g.rect(c.clip[0], 0, c.clip[1], H); g.clip() }
    sketchLine(L, t, c.clip && !block ? c.ink : c.line, c.at); g.restore()
    return
  }
  if (BACKGROUNDS[L.bg]) return BACKGROUNDS[L.bg](t)
  if (L.bg === 'camera') { drawCamera(); dimmed(L); return }
  if (L.bg === 'colors') {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, L.c1 || CD_DEFAULT.c1); gr.addColorStop(1, L.c2 || CD_DEFAULT.c2)
    g.fillStyle = gr; g.fillRect(0, 0, W, H); return
  }
  if (L.bg === 'image') {
    const it = mediaSlide(L.image), im = it?.type === 'image' && img(mediaUrl(it.path))
    if (!im) { paper(); return }
    fit(im, im.naturalWidth, im.naturalHeight, 0, 0, W, H, 'cover')
    dimmed(L); return
  }
  paper(); if (side) sideArt()
}
// Miniatura tła do wyboru (raz, 320×180).
export function bgThumb(id: string) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180
  const ctx = c.getContext('2d'); ctx.scale(320 / W, 180 / H)
  const prev = paintOn(ctx, studio.preview)
  setDemo(true)
  try { cdBackground({ ...CD_DEFAULT, bg: id, dim: 0 }, 4000) } finally { setDemo(false); paintOn(prev.ctx, prev.look) }
  return c.toDataURL('image/jpeg', 0.8)
}
// Proste grafiki po bokach: lewy — okrąg z kropkami, prawy — szczyty jak w logo.
export function sideArt() {
  g.save()
  g.lineWidth = 16; g.strokeStyle = '#f6a836'
  g.beginPath(); g.arc(150, 760, 150, 0, Math.PI * 2); g.stroke()
  g.fillStyle = 'rgba(43,43,43,0.55)'
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(60 + k * 46, 470 + r * 46, 7, 0, Math.PI * 2); g.fill() }
  g.lineWidth = 14; g.strokeStyle = '#2b2b2b'; g.lineJoin = 'round'
  g.beginPath(); g.moveTo(1630, 1000); g.lineTo(1715, 870); g.lineTo(1765, 930); g.lineTo(1830, 820); g.lineTo(1910, 960); g.stroke()
  g.fillStyle = '#f6a836'; g.beginPath(); g.arc(1800, 520, 44, 0, Math.PI * 2); g.fill()
  g.lineWidth = 6; g.strokeStyle = 'rgba(43,43,43,0.5)'
  g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(1660, 610 + k * 34); g.quadraticCurveTo(1720, 590 + k * 34, 1780, 610 + k * 34); g.quadraticCurveTo(1840, 630 + k * 34, 1900, 610 + k * 34) } g.stroke()
  g.restore()
}
