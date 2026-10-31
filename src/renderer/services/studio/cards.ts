// Plansze: ogłoszenia w pętli (grafiki, karty z tekstem, karta najbliższego nabożeństwa), odliczanie
// w stylu grafik ogłoszeń (papier, fala, timer), plansza końcowa z kodami QR.
import qrcode from 'qrcode-generator'
import { currentAnnouncements, nearestService, projectorGraphics, servicePlace, serviceTime, sortedServices } from '@/stores'
import type { StudioSlide } from '@/types'
import { H, W, studio } from './state'
import { S, background, fit, fitLine, g, img, paintOn, rounded, text, wrap } from './paint'
import { mediaSlide, mediaUrl } from './media'
import { BACKGROUNDS, BG_IDS } from './backgrounds'
import { drawCamera } from './camera'
import { settings } from '@/stores'

let slideBase = 0
export const svcWhen = svc => (svc ? new Date(svc.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + serviceTime(svc) : '')
// Slajdy ogłoszeń (zaznaczone „Pokaż na nabożeństwie”, tylko „dla wszystkich” — transmisja jest publiczna):
// najpierw grafiki, potem ogłoszenia bez grafiki jako karty z tekstem, na końcu (jeśli włączona) karta nabożeństwa.
export function slideCandidates(): StudioSlide[] {
  const pub = currentAnnouncements.value.filter(a => a.projector && (a.audience || 'public') === 'public')
  return [
    ...pub.filter(a => a.image).map(a => ({ id: 'a' + a.id, title: a.title, image: a.image })),
    ...projectorGraphics.value.filter(x => x.key.startsWith('e')).map(x => ({ id: x.key, title: x.name, image: x.image })),
    ...pub.filter(a => !a.image).map(a => ({ id: 'a' + a.id, title: a.title, text: a.text || '' })),
    { id: 'svc', title: 'Najbliższe nabożeństwo', service: true },
  ]
}
export function slides() {
  return slideCandidates().filter(c => !studio.hidden.includes(c.id))
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
  const list = slides(), idx = list.findIndex(x => x.id === id)
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
export function drawSlide(sl, x, y, w, h) {
  if (sl.im) fit(sl.im, sl.im.naturalWidth, sl.im.naturalHeight, x, y, w, h, 'cover')
  else if (sl.service) serviceCard(x, y, w, h)
  else textSlide(sl, x, y, w, h)
}
// Następne nabożeństwo, które się jeszcze NIE zaczęło (dzisiejsze po godzinie rozpoczęcia już nie).
export function upcomingService() {
  const now = Date.now()
  return [...sortedServices.value].reverse().find(s => s.date && new Date(`${s.date}T${serviceTime(s)}`).getTime() > now) || null
}
// Karta najbliższego nabożeństwa (gdy nie ma ogłoszeń albo włączona w pętli): logo, data, godzina i miejsce, kazanie.
export function serviceCard(x, y, w, h) {
  const k = w / 1240, svc = upcomingService(), cx = x + w / 2
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#f0a24f'); gr.addColorStop(1, '#d9733a')
  g.fillStyle = gr; g.fillRect(x, y, w, h)
  // delikatne koło w tle (jak słońce w logo)
  g.save(); g.globalAlpha = 0.12; g.fillStyle = '#fff'; g.beginPath(); g.arc(x + w * 0.86, y + h * 0.18, 260 * k, 0, Math.PI * 2); g.fill(); g.restore()
  // logo w białym kółku
  g.save(); g.shadowColor = 'rgba(60,30,10,0.35)'; g.shadowBlur = 24 * k; g.shadowOffsetY = 6 * k
  g.beginPath(); g.arc(cx, y + 118 * k, 74 * k, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore()
  const lg = img('./znak-obrys.png')
  if (lg) g.drawImage(lg, cx - 56 * k, y + 62 * k, 112 * k, 112 * k)
  text('NAJBLIŻSZE NABOŻEŃSTWO', cx, y + 248 * k, { size: Math.round(28 * k), weight: 800, color: '#5c2d0c', align: 'center' })
  if (!svc) {
    text('Termin wkrótce', cx, y + 360 * k, { size: Math.round(88 * k), weight: 800, color: '#2a1a10', align: 'center' })
    text('Szczegóły na kns-nabo.netlify.app', cx, y + 440 * k, { size: Math.round(38 * k), weight: 600, color: '#3b2312', align: 'center' })
    return
  }
  const day = new Date(svc.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase())
  const d = fitLine(day, w - 140 * k, Math.round(84 * k), Math.round(56 * k), 800)
  text(d.str, cx, y + 350 * k, { size: d.size, weight: 800, color: '#2a1a10', align: 'center' })
  text('godz. ' + serviceTime(svc) + ' · ' + servicePlace(svc), cx, y + 418 * k, { size: Math.round(42 * k), weight: 600, color: '#3b2312', align: 'center' })
  const sermon = svc.sermonTitle || '', more = [svc.passage, svc.speaker].filter(Boolean).join(' · ')
  if (sermon || more) {
    g.fillStyle = 'rgba(42,26,16,0.25)'; g.fillRect(cx - 90 * k, y + 458 * k, 180 * k, 4 * k)
    if (sermon) { const t = fitLine('„' + sermon + '”', w - 160 * k, Math.round(48 * k), Math.round(32 * k), 800); text(t.str, cx, y + 540 * k, { size: t.size, weight: 800, color: '#fff', align: 'center', shadow: 8 * k }) }
    if (more) { const m = fitLine(more, w - 160 * k, Math.round(36 * k), Math.round(26 * k), 600); text(m.str, cx, y + (sermon ? 600 : 540) * k, { size: m.size, weight: 600, color: '#fff3e0', align: 'center' }) }
  }
}
export function drawCarousel(c, x, y, w, h) {
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
export const CD_DEFAULT = { bg: 'paper', c1: '#1d2a44', c2: '#e8952f', image: '', dim: 45, title: 'ZACZYNAMY ZA', sub: '', layout: 'top', timer: 'blob', accent: '#f6a836', show: 'ann', photo: '' } as const
// tło spoza listy (np. dawne „Ciemne”) — papier
const safeBg = L => (BG_IDS.includes(L.bg) ? L : { ...L, bg: 'paper' })
// wizja rysuje wygląd z chwili „Na wizję” (S.styles), podgląd — bieżące ustawienia
export const styleOf = (k: 'cd' | 'end', live) => (S?.styles ? S.styles[k] : live)
export const cdLook = () => safeBg({ ...CD_DEFAULT, ...(styleOf('cd', settings.cdLook) || {}) })
// Wygląd „Końca”: tło jak w odliczaniu, układ (karta z kafelkami, obok siebie, duży napis), napis i podpis.
export const END_DEFAULT = { bg: 'paper', c1: '#1d2a44', c2: '#e8952f', image: '', dim: 45, title: 'Dziękujemy, że byliście z nami!', sub: '', layout: 'cards', pic: '' } as const
export const endLook = () => safeBg({ ...END_DEFAULT, ...(styleOf('end', settings.endLook) || {}) })
// Pasek mówcy: puste napisy — mówca, tytuł kazania i fragment z najbliższego nabożeństwa.
export const LOWER_DEFAULT = { name: '', sub: '', color: '#f6a836', logo: true } as const
export const lowerLookOf = () => S?.lowerLook || { ...LOWER_DEFAULT, ...(settings.lowerLook || {}) }
// Baner (nakładka na Kamerze i Rzutniku): styl, kolor, napis, podpis, dopisek i kod QR.
export const BANNER_DEFAULT = { style: 'frame', color: '#f6a836', title: 'Dziękujemy, że byliście z nami!', sub: '', note: '', qr: 'all', link: '' } as const
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
export const prayerLook = () => S?.prayerLook || ({ text: settings.prayerText, sub: settings.prayerSub, link: settings.prayerLink, label: settings.prayerLinkLabel })
// banery presetu: edycja i miniatura pokazują jeden, kolejka rusza dopiero na wizji
export const presetBanners = (d, edit = false) => ((!edit && d.cycle && d.queue?.length) ? d.queue : [d.banner]).map(b => ({ ...BANNER_DEFAULT, ...b }))
const dimmed = L => { g.fillStyle = 'rgba(0,0,0,' + Math.max(0, Math.min(0.8, (L.dim ?? 45) / 100)) + ')'; g.fillRect(0, 0, W, H) }
// Tło planszy: papier z grafikami po bokach, szkic, góry, gradient dwóch kolorów, grafika z Biblioteki albo kamera na żywo.
export function cdBackground(L, t, side = true) {
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
  try { cdBackground({ ...CD_DEFAULT, bg: id }, 4000) } finally { paintOn(prev.ctx, prev.look) }
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
