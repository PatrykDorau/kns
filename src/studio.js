// Studio streamu: cały obraz transmisji składa aplikacja (płótno 1920×1080) — kamera z ATEM (USB), napisy pieśni
// z prawdziwym cieniem, sceny (odliczanie z ogłoszeniami, pętla ogłoszeń, rzutnik, rzutnik + kamera w okienku,
// plansza końcowa) i pasek z mówcą. Kodowanie: WebCodecs, sprzętowo na karcie graficznej (H.264 High, stała
// przepływność, klatka kluczowa co 2 s) → FFmpeg w procesie głównym tylko wysyła na YouTube. Dźwięk: ATEM (USB)
// + dźwięk filmów ze scen, zmiksowany tutaj (PCM 48 kHz) → FFmpeg koduje AAC.
// Jak w ATEM i na rzutniku: zmiany (scena, pasek mówcy, napisy, okienko) najpierw idą na Podgląd, a na wizję
// dopiero po „Na wizję” — chyba że włączone „Od razu na wizję”. Podgląd rysowany w połowie rozdzielczości.
// Działa niezależnie od otwartego widoku (moduł), żeby wyjście z ekranu Stream nie przerwało transmisji.
import { reactive } from 'vue'
import qrcode from 'qrcode-generator'
import { api, currentAnnouncements, itemById, nearestService, projectorGraphics, serviceTime, servicePlace, sortedServices } from './store.js'

export const SCENES = [
  ['camera', 'Kamera'],
  ['projector', 'Rzutnik'],
  ['projectorPip', 'Rzutnik + kamera'],
  ['countdown', 'Odliczanie'],
  ['announcements', 'Ogłoszenia'],
  ['media', 'Media'],
  ['end', 'Koniec'],
]
// media — materiał na cały ekran (scena „Media”); omedia — materiał jako nakładka na kamerze/rzutniku,
// ovl: 'off', 'full' (cały kadr — PNG z przezroczystym tłem, napis bez tła), 'corner' (okienko w rogu, mpos)
const look = () => ({ scene: 'camera', lyricsOn: true, lowerThird: false, pip: { corner: 'br', size: 'small' }, lowerAt: 0, lowerOff: 0, media: '', omedia: '', ovl: 'off', mpos: { corner: 'tr', size: 'small' } })
export const studio = reactive({
  program: look(), // to, co idzie na YouTube
  preview: look(), // to, co przygotowujemy
  direct: false, // „Od razu na wizję” — zmiany od razu na wizji (bez podglądu)
  lyrics: '',
  slideEvery: 8, // co ile sekund następne ogłoszenie
  hidden: ['svc'], // wyłączone slajdy (id); „svc” — karta najbliższego nabożeństwa
  slideId: '', // slajd na wizji teraz
  skipped: 0, // klatki pominięte, bo karta graficzna nie nadążała
  audioDb: -100, // szczyt dźwięku w ostatniej chwili (dBFS)
  silentFor: 0, // ile sekund cisza (np. odpięty kabel z miksera)
  camera: '', audio: '', fps: 30, bitrate: 6800000, live: false, error: '', encoder: '',
  hardware: null, // null — nie sprawdzono; true/false — czy karta koduje H.264
  remoteScreen: false, // obraz rzutnika przez sieć dociera
  projector: { kind: 'none' }, // to, co pokazuje rzutnik (etap 2): { kind: 'image'|'video'|'text'|'none', url, text, style, playing, time, at }
  countdownTo: 0, // odliczanie do tej chwili (ms); 0 — do godziny najbliższego nabożeństwa
  left: 0, // ile sekund zostało (do pulpitu)
  autoCamera: false, // po zerze (i 3 s „Zaczynamy”) samo przełącza na Kamerę
  end: { account: '', phone: '', name: 'Kościół Na Skale', title: 'Darowizna', youtube: '', spotify: '' }, // plansza końcowa
  // odtwarzanie materiałów (wspólne dla podglądu i wizji — jak napisy, działa od razu): film gra, pętla, głośność,
  // slajd prezentacji (dla każdej osobno)
  mplay: { playing: true, loop: false, volume: 1, slides: {}, time: 0, duration: 0 },
})
const W = 1920, H = 1080
let canvas = null, g = null, timer = 0, frameNo = 0, needKey = true
let camVideo = null, camStream = null, encoder = null
let progFrom = null, progAt = 0 // przejście na wizji (przenikanie z poprzedniego wyglądu)
let lyricShown = '', lyricPrev = '', lyricAt = 0
let S = null // wygląd, który właśnie rysujemy (wizja albo podgląd)
let slideBase = 0
const images = new Map() // adres → obraz (grafiki ogłoszeń, logo, rzutnik)

/* ---------- pomocnicze ---------- */
function img(url) {
  if (!url) return null
  let im = images.get(url)
  if (!im) {
    im = new Image()
    if (/^(https?|media):/.test(url)) im.crossOrigin = 'anonymous' // bez tego płótno „brudzi się” i karta nie zakoduje klatki
    im.src = url
    images.set(url, im)
  }
  return im.complete && im.naturalWidth ? im : null
}
function fit(src, sw, sh, x, y, w, h, mode = 'contain') {
  const s = mode === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh)
  const dw = sw * s, dh = sh * s
  g.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}
function rounded(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r) }
// Grafika na cały kadr: rozmyte tło z tej samej grafiki + grafika w całości.
function fullImage(im) {
  g.save(); g.filter = 'blur(40px) brightness(0.45)'; fit(im, im.naturalWidth, im.naturalHeight, -60, -60, W + 120, H + 120, 'cover'); g.restore()
  fit(im, im.naturalWidth, im.naturalHeight, 0, 0, W, H, 'contain')
}
// Tło planszy: ciemne, z wolno płynącymi plamami w kolorach kościoła.
function background(t) {
  g.fillStyle = '#0f1013'; g.fillRect(0, 0, W, H)
  const blob = (cx, cy, r, color) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(15,16,19,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
  blob(W * (0.25 + 0.08 * Math.sin(t / 7000)), H * (0.3 + 0.1 * Math.cos(t / 9000)), 900, 'rgba(232,163,61,0.32)')
  blob(W * (0.8 + 0.06 * Math.cos(t / 8000)), H * (0.75 + 0.08 * Math.sin(t / 6000)), 800, 'rgba(224,122,95,0.26)')
  blob(W * (0.6 + 0.1 * Math.sin(t / 11000)), H * 0.1, 600, 'rgba(169,139,255,0.12)')
}
function text(str, x, y, { size = 48, weight = 600, color = '#fff', align = 'left', alpha = 1, shadow = 0 } = {}) {
  g.save()
  g.globalAlpha *= alpha
  g.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = shadow; g.shadowOffsetY = shadow / 6 }
  g.fillText(str, x, y)
  g.restore()
}
function logo(x, y, h) { const im = img('./znak.png'); if (im) g.drawImage(im, x, y, h * im.naturalWidth / im.naturalHeight, h) }
const svcWhen = svc => (svc ? new Date(svc.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + serviceTime(svc) : '')
// Slajdy ogłoszeń (zaznaczone „Pokaż na nabożeństwie”, tylko „dla wszystkich” — transmisja jest publiczna):
// najpierw grafiki, potem ogłoszenia bez grafiki jako karty z tekstem, na końcu (jeśli włączona) karta nabożeństwa.
export function slideCandidates() {
  const pub = currentAnnouncements.value.filter(a => a.projector && (a.audience || 'public') === 'public')
  return [
    ...pub.filter(a => a.image).map(a => ({ id: 'a' + a.id, title: a.title, image: a.image })),
    ...projectorGraphics.value.filter(x => x.key.startsWith('e')).map(x => ({ id: x.key, title: x.name, image: x.image })),
    ...pub.filter(a => !a.image).map(a => ({ id: 'a' + a.id, title: a.title, text: a.text || '' })),
    { id: 'svc', title: 'Najbliższe nabożeństwo', service: true },
  ]
}
function slides() {
  return slideCandidates().filter(c => !studio.hidden.includes(c.id))
    .map(c => (c.image ? (img(c.image) ? { ...c, im: img(c.image) } : null) : c)).filter(Boolean)
}
function carousel(t) {
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
// Tekst w kilku liniach (zawijanie po słowach), najwyżej max linii.
function wrap(str, width, size, weight, max) {
  g.save(); g.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`
  const out = []
  for (const para of String(str).split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? line + ' ' + w : w
      if (g.measureText(tryLine).width > width && line) { out.push(line); line = w } else line = tryLine
    }
    if (line) out.push(line)
  }
  g.restore()
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…' }
  return out
}
// Ogłoszenie bez grafiki: pomarańczowa karta jak grafiki ogłoszeń — tytuł i treść.
function textSlide(sl, x, y, w, h) {
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
function drawSlide(sl, x, y, w, h) {
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
function serviceCard(x, y, w, h) {
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
// Jedna linia, która musi się zmieścić: najpierw mniejsza czcionka (do min), potem skrót z „…”.
function fitLine(str, maxW, size, min, weight) {
  g.save()
  const width = sz => { g.font = `${weight} ${sz}px "Segoe UI", system-ui, sans-serif`; return g.measureText(str).width }
  while (size > min && width(size) > maxW) size -= 2
  let out = String(str)
  if (width(size) > maxW) {
    g.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`
    while (out.length > 1 && g.measureText(out + '…').width > maxW) out = out.slice(0, -1)
    out = out.replace(/[\s·,.-]+$/, '') + '…'
  }
  g.restore()
  return { str: out, size }
}
function drawCarousel(c, x, y, w, h) {
  drawSlide(c.prev, x, y, w, h)
  if (c.mix < 1) { g.save(); g.globalAlpha = c.mix; drawSlide(c.cur, x, y, w, h); g.restore() } else drawSlide(c.cur, x, y, w, h)
}
// Kod QR rysowany na płótnie (macierz liczona raz dla danego tekstu).
const qrCache = new Map()
function qr(str, x, y, size) {
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
function bankQr(e) {
  const acct = String(e.account || '').replace(/\D/g, '')
  if (acct.length !== 26) return ''
  const clean = v => String(v || '').replace(/\|/g, ' ').trim()
  return `|PL|${acct}|000000|${clean(e.name).slice(0, 20)}|${clean(e.title).slice(0, 32)}|||`
}
function camera(x = 0, y = 0, w = W, h = H) {
  if (camVideo && camVideo.readyState >= 2) fit(camVideo, camVideo.videoWidth, camVideo.videoHeight, x, y, w, h, 'cover')
  else { g.fillStyle = '#000'; g.fillRect(x, y, w, h); text(studio.camera ? 'Czekam na obraz z kamery…' : 'Wybierz kamerę (ATEM)', x + w / 2, y + h / 2, { size: Math.max(24, h / 20), color: '#8f98a8', align: 'center' }) }
}

/* ---------- styl grafik ogłoszeń: pogniecony papier, karta, logo u dołu ---------- */
const CARD = { x: 80, y: 80, w: W - 160, h: H - 175 }
let paperCanvas = null
function paper() {
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
function cardLogo() {
  const im = img('./znak.png')
  if (!im) return
  const h = 190, w = h * im.naturalWidth / im.naturalHeight
  g.drawImage(im, W / 2 - w / 2, CARD.y + CARD.h - h / 2, w, h)
}
// Fala u góry: dwie warstwy (ciemniejsza pod spodem) z falującą dolną krawędzią.
function topWave() {
  const wave = (base, amp, len, phase, color) => {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0)
    for (let x = W; x >= 0; x -= 20) g.lineTo(x, base + amp * Math.sin((x / len) * Math.PI * 2 + phase))
    g.closePath(); g.fillStyle = color; g.fill()
  }
  wave(250, 26, 760, 1.2, '#e8952f')
  wave(222, 22, 640, 0, '#f6a836')
}
// Timer: ciemna plakietka z falowanym brzegiem (kolor obwódki logo), cyfry w kolorze fali.
export function countdownLeft() {
  const svc = nearestService.value
  const start = studio.countdownTo || (svc ? new Date(`${svc.date}T${serviceTime(svc)}`).getTime() : 0)
  return Math.max(0, Math.ceil((start - Date.now()) / 1000))
}
// Odliczanie: minuty od teraz (np. 10) albo 0 — do godziny nabożeństwa.
export function setCountdown(minutes) { studio.countdownTo = minutes ? Date.now() + minutes * 60000 : 0; armed = false }
export function addCountdown(minutes) { studio.countdownTo = Math.max(Date.now(), studio.countdownTo || Date.now()) + minutes * 60000 }
let armed = false, zeroAt = 0
function timerBlob() {
  const left = countdownLeft()
  const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60
  const clock = (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0')
  const cx = W / 2, cy = 165, rx = h ? 310 : 265, ry = 130
  g.save()
  g.beginPath()
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2, wob = 1 + 0.035 * Math.sin(a * 14)
    const x = cx + Math.cos(a) * rx * wob, y = cy + Math.sin(a) * ry * wob
    i ? g.lineTo(x, y) : g.moveTo(x, y)
  }
  g.closePath()
  g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 30; g.shadowOffsetY = 8
  g.fillStyle = '#2b2b2b'; g.fill()
  g.restore()
  text(left ? 'ZACZYNAMY ZA' : 'ZARAZ', cx, cy - 46, { size: 30, weight: 800, color: '#f3e3c8', align: 'center' })
  text(left ? clock : 'ZACZYNAMY', cx, cy + (left ? 64 : 46), { size: left ? 112 : 64, weight: 800, color: '#f6a836', align: 'center' })
  return left
}
// Proste grafiki po bokach: lewy — okrąg z kropkami, prawy — szczyty jak w logo.
function sideArt() {
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

/* ---------- sceny ---------- */
const SCENE_DRAW = {
  camera(t) { camera(); mediaOverlay(); lowerThird(t); lyrics(t) },
  // „Zaraz zaczynamy”: papier, u góry pomarańczowa fala z timerem, na środku ogłoszenia jak prezentacja w pętli,
  // po bokach proste grafiki (okrąg z kropkami, szczyty jak w logo). Bez animacji — tylko przenikanie grafik.
  countdown(t) {
    paper()
    sideArt()
    const c = carousel(t)
    const pw = 1240, ph = 698, px = (W - pw) / 2, py = 330
    g.save(); g.shadowColor = 'rgba(40,30,20,0.35)'; g.shadowBlur = 50; g.shadowOffsetY = 18
    rounded(px, py, pw, ph, 18); g.fillStyle = '#fff'; g.fill(); g.restore()
    g.save(); rounded(px, py, pw, ph, 18); g.clip()
    if (c) drawCarousel(c, px, py, pw, ph)
    else serviceCard(px, py, pw, ph)
    g.restore()
    topWave()
    const left = timerBlob()
    // po zerze: 3 s „Zaraz zaczynamy”, potem sama Kamera (gdy zaznaczone)
    if (S !== studio.program) return
    if (left > 0) { armed = true; zeroAt = 0 } else if (armed && studio.autoCamera) {
      zeroAt = zeroAt || t
      if (t - zeroAt > 3000) { armed = false; studio.preview.scene = 'camera'; toProgram(p => { p.scene = 'camera' }) }
    }
  },
  announcements(t) {
    const c = carousel(t)
    if (!c) { paper(); text('Brak ogłoszeń — włącz je na liście pod podglądem', W / 2, H / 2, { size: 40, color: '#6b6258', align: 'center' }); return }
    drawCarousel(c, 0, 0, W, H)
  },
  // Koniec: logo, podziękowanie, najbliższe nabożeństwo i kafelki z kodami QR (wsparcie, YouTube, Spotify).
  end() {
    paper()
    g.fillStyle = 'rgba(38, 30, 22, 0.55)'; g.fillRect(0, 0, W, H) // przyciemnione tło
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 40; g.shadowOffsetY = 12
    rounded(CARD.x, CARD.y, CARD.w, CARD.h, 22); g.fillStyle = '#e6ddcf'; g.fill(); g.restore()
    const lg = img('./znak-obrys.png')
    if (lg) g.drawImage(lg, W / 2 - 85, 110, 170, 170)
    text('Dziękujemy, że byliście z nami!', W / 2, 375, { size: 80, weight: 800, color: '#d9862a', align: 'center' })
    const svc = upcomingService()
    if (svc) text('Do zobaczenia: ' + svcWhen(svc) + ' · ' + servicePlace(svc), W / 2, 445, { size: 38, weight: 600, color: '#2b2b2b', align: 'center' })
    const e = studio.end, bank = bankQr(e), phone = String(e.phone || '').replace(/[^\d+]/g, '').replace(/^(\+?48)?(\d{3})(\d{3})(\d{3})$/, '$2 $3 $4')
    const tiles = []
    if (bank || phone) tiles.push({ head: 'Wesprzyj kościół', qr: bank, lines: [bank && 'Zeskanuj w aplikacji banku', phone && 'albo BLIK na numer ' + phone].filter(Boolean) })
    if (e.youtube) tiles.push({ head: 'YouTube', qr: e.youtube, lines: ['Kazania i transmisje'] })
    if (e.spotify) tiles.push({ head: 'Spotify', qr: e.spotify, lines: ['Kazania jako podcast'] })
    if (!tiles.length) { text('Kościół Na Skale · kns-nabo.netlify.app', W / 2, 640, { size: 38, weight: 500, color: '#6b6258', align: 'center' }); return }
    const tw = 470, th = 440, gap = 60, x0 = (W - tiles.length * tw - (tiles.length - 1) * gap) / 2, y = 500
    tiles.forEach((tl, i) => {
      const x = x0 + i * (tw + gap)
      g.save(); g.shadowColor = 'rgba(40,30,20,0.18)'; g.shadowBlur = 30; g.shadowOffsetY = 8; rounded(x, y, tw, th, 22); g.fillStyle = '#f3eee6'; g.fill(); g.restore()
      g.fillStyle = '#f6a836'; rounded(x, y, tw, 8, 4); g.fill()
      text(tl.head, x + tw / 2, y + 66, { size: 40, weight: 800, color: '#2b2b2b', align: 'center' })
      if (tl.qr) qr(tl.qr, x + (tw - 250) / 2, y + 92, 250)
      else { tl.lines = []; text('Przelew BLIK na numer', x + tw / 2, y + 180, { size: 34, weight: 600, color: '#6b6258', align: 'center' }); text(phone, x + tw / 2, y + 265, { size: 64, weight: 800, color: '#e8952f', align: 'center' }); text('Dziękujemy za każde wsparcie!', x + tw / 2, y + 360, { size: 28, weight: 500, color: '#6b6258', align: 'center' }) }
      tl.lines.forEach((l, k) => text(l, x + tw / 2, y + (tl.qr ? 385 : 300) + k * 38, { size: k ? 30 : 27, weight: k ? 800 : 500, color: k ? '#2b2b2b' : '#6b6258', align: 'center' }))
    })
  },
  projector(t) { projectorFrame(t); mediaOverlay(); lyrics(t) },
  media(t) {
    const it = mediaSlide(S.media)
    if (!it) { background(t); text('Wybierz materiał w panelu „Media”', W / 2, H / 2, { size: 40, color: '#8f98a8', align: 'center' }); return }
    drawMedia(it, true); lowerThird(t); lyrics(t)
  },
  // (projectorPip — niżej: okienko z kamerą, pasek mówcy i napisy)
  projectorPip(t) {
    projectorFrame(t)
    // okienko z kamerą (z ATEM — to, co jest na wizji): wybrany róg, małe albo duże
    const w = S.pip.size === 'large' ? 800 : 512, h = w * 9 / 16, m = 48
    const x = S.pip.corner.includes('l') ? m : W - w - m, y = S.pip.corner.includes('t') ? m : H - h - m
    g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 40; rounded(x, y, w, h, 22); g.fillStyle = '#000'; g.fill(); g.restore()
    g.save(); rounded(x, y, w, h, 22); g.clip(); camera(x, y, w, h); g.restore()
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; rounded(x, y, w, h, 22); g.stroke(); g.restore()
    mediaOverlay(); lowerThird(t); lyrics(t)
  },
}
// Napisy pieśni: biały tekst, miękki cień, przenikanie przy zmianie zwrotki.
function lyrics(t) {
  if (!S.lyricsOn) return
  if (studio.lyrics !== lyricShown) { lyricPrev = lyricShown; lyricShown = studio.lyrics; lyricAt = t }
  const k = Math.min(1, (t - lyricAt) / 300)
  const draw = (str, alpha) => {
    if (!str || alpha <= 0) return
    const lines = str.split('\n').filter(l => l.trim())
    const size = lines.length > 4 ? 54 : 64, lh = size * 1.25
    lines.forEach((l, i) => text(l.trim(), W / 2, H - 90 - (lines.length - 1 - i) * lh, { size, weight: 700, align: 'center', alpha, shadow: 22 }))
  }
  draw(lyricPrev, 1 - k); draw(lyricShown, k)
}
// Pasek z mówcą i tytułem kazania (wjeżdża z lewej), z logo kościoła w białym kółku.
function lowerThird(t) {
  const svc = nearestService.value
  if (!svc || !(svc.speaker || svc.sermonTitle)) return
  // po wyłączeniu pasek wyjeżdża w lewo (pół sekundy)
  const off = !S.lowerThird
  if (off && !(S.lowerOff && t - S.lowerOff < 500)) return
  const k = off ? 1 - Math.min(1, (t - S.lowerOff) / 500) : Math.min(1, (t - S.lowerAt) / 500), e = 1 - Math.pow(1 - k, 3)
  const maxText = 1500 - 282
  const name = fitLine(svc.speaker || 'Kazanie', maxText, 46, 34, 800)
  const sub = fitLine([svc.sermonTitle, svc.passage].filter(Boolean).join(' · '), maxText, 32, 24, 500)
  g.save(); g.font = `800 ${name.size}px "Segoe UI", system-ui, sans-serif`; const w1 = g.measureText(name.str).width
  g.font = `500 ${sub.size}px "Segoe UI", system-ui, sans-serif`; const w2 = g.measureText(sub.str).width; g.restore()
  const w = Math.min(1500, Math.max(620, 222 + Math.max(w1, w2) + 60)), bh = 150
  const x = -w + (w + 60) * e, y = H - 250
  g.save(); g.globalAlpha = e
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30
  rounded(x, y, w, bh, 18); g.fillStyle = 'rgba(15,16,19,0.88)'; g.fill(); g.shadowBlur = 0
  g.fillStyle = '#f6a836'; g.fillRect(x + 18, y + bh - 6, w - 36, 6)
  // logo: białe kółko wystające nad pasek
  const cx = x + 100, cy = y + bh / 2, r = 92
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 24
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.shadowBlur = 0
  const lg = img('./znak-obrys.png')
  if (lg) g.drawImage(lg, cx - 72, cy - 72, 144, 144)
  g.restore()
  text(name.str, x + 222, y + 66, { size: name.size, weight: 800, alpha: e })
  text(sub.str, x + 222, y + 116, { size: sub.size, weight: 500, color: '#d6d8e0', alpha: e })
}
// To, co pokazuje rzutnik (etap 2): grafika, film, tekst/slajd.
let projVideo = null, remoteVideo = null
// Obraz rzutnika z innego komputera (WebRTC) — null, gdy połączenie zerwane.
export function setRemoteScreen(stream) {
  if (!stream) { if (remoteVideo) remoteVideo.srcObject = null; studio.remoteScreen = false; return }
  if (!remoteVideo) { remoteVideo = document.createElement('video'); remoteVideo.muted = true; remoteVideo.playsInline = true }
  remoteVideo.srcObject = stream; remoteVideo.play().catch(() => {}); studio.remoteScreen = true
}
function projectorFrame(t) {
  if (studio.remoteScreen && remoteVideo?.readyState >= 2) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); fit(remoteVideo, remoteVideo.videoWidth, remoteVideo.videoHeight, 0, 0, W, H); return }
  const p = studio.projector
  if (p.kind === 'image' && p.url) { const im = img(p.url); if (im) { fullImage(im); return } }
  if (p.kind === 'video' && p.url) {
    if (!projVideo) { projVideo = document.createElement('video'); projVideo.crossOrigin = 'anonymous'; projVideo.playsInline = true; connectMedia(projVideo) }
    if (projVideo.dataset.src !== p.url) { projVideo.dataset.src = p.url; projVideo.src = p.url }
    // zgranie z rzutnikiem: czas i pauza
    const want = (p.time || 0) + (p.playing ? (Date.now() - (p.at || Date.now())) / 1000 : 0)
    if (projVideo.readyState >= 1 && Math.abs(projVideo.currentTime - want) > 0.6) projVideo.currentTime = want
    if (p.playing && projVideo.paused) projVideo.play().catch(() => {})
    if (!p.playing && !projVideo.paused) projVideo.pause()
    if (projVideo.readyState >= 2) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); fit(projVideo, projVideo.videoWidth, projVideo.videoHeight, 0, 0, W, H) } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
    return
  }
  if (projVideo && !projVideo.paused) projVideo.pause()
  if (p.kind === 'text' && p.text) {
    const s = p.style || {}
    g.fillStyle = s.bg || '#000'; g.fillRect(0, 0, W, H)
    const lines = String(p.text).split('\n')
    const size = Math.round((s.fs || 12) * 6.5), lh = size * 1.3
    const total = lines.length * lh
    const y0 = s.valign === 'top' ? 120 + size : s.valign === 'bottom' ? H - 120 - total + size : (H - total) / 2 + size
    const align = s.align || 'center', x = align === 'left' ? 120 : align === 'right' ? W - 120 : W / 2
    lines.forEach((l, i) => text(l, x, y0 + i * lh, { size, weight: 700, color: s.color || '#fff', align, shadow: s.shadow ? 16 : 0 }))
    return
  }
  background(t)
  text('Rzutnik nic teraz nie pokazuje', W / 2, H / 2, { size: 40, color: '#8f98a8', align: 'center' })
}

/* ---------- media: materiały z biblioteki (zdjęcia, filmy, napisy, prezentacje) ---------- */
const mediaUrl = p => (/^https?:\/\//.test(p) ? p : 'media://local/' + encodeURIComponent(p))
const videos = new Map() // id materiału → <video> (dźwięk filmu idzie do transmisji)
// Materiał do narysowania: dla prezentacji/pętli — jej bieżący slajd.
export function mediaSlide(id) {
  const it = id && itemById(id)
  if (!it || it.missing) return null
  if (it.type !== 'scene') return it
  const list = (it.entries || []).map(e => itemById(e.ref)).filter(x => x && !x.missing)
  if (!list.length) return null
  const n = ((studio.mplay.slides[id] || 0) % list.length + list.length) % list.length
  return { ...list[n], deckOf: id, slideNo: n + 1, slideCount: list.length }
}
function mediaVideo(it) {
  let v = videos.get(it.id)
  if (!v) {
    v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.preload = 'auto'
    v.src = mediaUrl(it.path); videos.set(it.id, v); connectMedia(v)
  }
  return v
}
// Tekst (napis, slajd z tekstem) — jak na rzutniku; jako nakładka bez tła, z cieniem.
function textItem(p, opaque) {
  if (opaque) { g.fillStyle = p.bg || '#000'; g.fillRect(0, 0, W, H); const bi = p.bgImage && img(mediaUrl(p.bgImage)); if (bi) { fit(bi, bi.naturalWidth, bi.naturalHeight, 0, 0, W, H, 'cover'); g.fillStyle = 'rgba(0,0,0,' + (p.dim ?? 0.45) + ')'; g.fillRect(0, 0, W, H) } }
  const lines = String(p.text || '').split('\n')
  const size = Math.round((p.fs || 12) * 6.5), lh = size * 1.3, total = lines.length * lh
  const y0 = p.valign === 'top' ? 120 + size : p.valign === 'bottom' ? H - 120 - total + size : (H - total) / 2 + size
  const align = p.align || 'center', x = align === 'left' ? 120 : align === 'right' ? W - 120 : W / 2
  lines.forEach((l, i) => text(l, x, y0 + i * lh, { size, weight: 700, color: p.color || '#fff', align, shadow: opaque ? 0 : 24 }))
}
// Cały kadr: opaque — jako scena (z tłem), inaczej nakładka (przezroczystość PNG, napis bez tła).
function drawMedia(it, opaque) {
  if (it.type === 'image') {
    const im = img(mediaUrl(it.path))
    if (!im) return
    if (opaque) fullImage(im); else fit(im, im.naturalWidth, im.naturalHeight, 0, 0, W, H, 'contain')
  } else if (it.type === 'video') {
    const v = mediaVideo(it)
    if (opaque) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
    if (v.readyState >= 2) fit(v, v.videoWidth, v.videoHeight, 0, 0, W, H)
  } else if (it.type === 'text') textItem(it, opaque)
}
// Okienko w rogu (jak kamera w „Rzutnik + kamera”): materiał przeskalowany do okienka.
function mediaBox(it, pos) {
  const w = pos.size === 'large' ? 800 : 512, h = w * 9 / 16, m = 48
  const x = pos.corner.includes('l') ? m : W - w - m, y = pos.corner.includes('t') ? m : H - h - m
  g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 40; rounded(x, y, w, h, 22); g.fillStyle = '#000'; g.fill(); g.restore()
  g.save(); rounded(x, y, w, h, 22); g.clip(); g.translate(x, y); g.scale(w / W, h / H); drawMedia(it, true); g.restore()
  g.save(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; rounded(x, y, w, h, 22); g.stroke(); g.restore()
}
function mediaOverlay() {
  if (S.ovl === 'off') return
  const it = mediaSlide(S.omedia)
  if (!it) return
  if (S.ovl === 'corner') mediaBox(it, S.mpos); else drawMedia(it, false)
}
// Co jest na wizji: materiał sceny „Media” i materiał nakładki (scena „Media” — bez nakładki).
export function airMedia(L = studio.program) {
  const ids = []
  if (L.scene === 'media' && L.media) ids.push(L.media)
  if (L.ovl !== 'off' && L.omedia && L.scene !== 'media' && !ids.includes(L.omedia)) ids.push(L.omedia)
  return ids
}
// Filmy: grają tylko te na wizji (dźwięk w transmisji); film, który właśnie wszedł na wizję — od początku.
// Prezentacje z „automatycznie”: następny slajd co ustawioną liczbę sekund.
let onAir = new Set(); const stepAt = {}
function syncVideos() {
  const M = studio.mplay, now = performance.now()
  const air = airMedia()
  const vids = new Set()
  for (const id of air) {
    const it = mediaSlide(id)
    if (it?.type === 'video') { vids.add(it.id); if (!onAir.has(it.id)) { const v = mediaVideo(it); v.currentTime = 0; M.playing = true } }
    const deck = itemById(id)
    if (deck?.type === 'scene') {
      if (!onAir.has(id)) stepAt[id] = now
      if (deck.mAuto && now - (stepAt[id] || now) > (deck.mSec || 8) * 1000 && it?.type !== 'video') { stepAt[id] = now; M.slides = { ...M.slides, [id]: (M.slides[id] || 0) + 1 } }
    }
  }
  onAir = new Set([...air, ...vids])
  for (const [id, v] of videos) {
    v.loop = M.loop; v.volume = Math.max(0, Math.min(1, M.volume))
    if (vids.has(id) && M.playing) { if (v.paused) v.play().catch(() => {}) } else if (!v.paused) v.pause()
  }
  const first = [...vids][0], v = first && videos.get(first)
  M.time = v ? v.currentTime : 0; M.duration = v && isFinite(v.duration) ? v.duration : 0
}
export function mediaCtl(cmd, val) {
  const M = studio.mplay
  const vid = () => { for (const id of airMedia()) { const it = mediaSlide(id); if (it?.type === 'video') return videos.get(it.id) } return null }
  if (cmd === 'play') M.playing = !M.playing
  else if (cmd === 'restart') { const v = vid(); if (v) v.currentTime = 0; M.playing = true }
  else if (cmd === 'seek') { const v = vid(); if (v && isFinite(val)) v.currentTime = val }
  else if (cmd === 'loop') M.loop = !M.loop
  else if (cmd === 'volume') M.volume = +val
  else if (cmd === 'slide') { const id = val.id; stepAt[id] = performance.now(); M.slides = { ...M.slides, [id]: (M.slides[id] || 0) + val.d } }
}
// Wybór materiału — jak inne zmiany: najpierw podgląd, na wizję po „Na wizję”.
// „Na ekran”: scena Media z tym materiałem. „Nakładka”: ten materiał na kamerze/rzutniku (napis — na cały kadr, reszta — w rogu).
export function showMediaFull(id) { change(l => { l.media = id; l.scene = 'media' }) }
export function showMediaOverlay(id) {
  const it = itemById(id)
  change(l => { l.omedia = id; if (l.ovl === 'off') l.ovl = it?.type === 'text' ? 'full' : 'corner'; if (l.scene === 'media') l.scene = 'camera' })
}
export function setOverlayMode(mode) { change(l => { l.ovl = mode }) }
export function setMediaPos(p) { change(l => { l.mpos = { ...l.mpos, ...p } }) }

/* ---------- pętla rysowania i kodowanie ---------- */
function frame() {
  const t = performance.now()
  if (studio.program.scene === 'countdown' || studio.preview.scene === 'countdown') { const l = countdownLeft(); if (l !== studio.left) studio.left = l }
  syncVideos()
  S = studio.program
  ;(SCENE_DRAW[S.scene] || SCENE_DRAW.camera)(t)
  if (progFrom && t - progAt < 500) {
    // przenikanie: poprzedni wygląd wizji znika
    g.save(); g.globalAlpha = 1 - (t - progAt) / 500
    const tmp = getScratch(); const sg = tmp.getContext('2d'); const keep = g; g = sg; S = progFrom
    try { (SCENE_DRAW[S.scene] || SCENE_DRAW.camera)(t) } finally { g = keep; S = studio.program }
    g.drawImage(tmp, 0, 0); g.restore()
  } else progFrom = null
  // podgląd: co drugą klatkę, w połowie rozdzielczości (słabszy komputer)
  if (pvCanvas?.isConnected && !studio.direct && frameNo2++ % 2 === 0) {
    const keep = g; g = pv; S = studio.preview
    g.setTransform(PV, 0, 0, PV, 0, 0)
    try { (SCENE_DRAW[S.scene] || SCENE_DRAW.camera)(t) } finally { g.setTransform(1, 0, 0, 1, 0, 0); g = keep; S = studio.program }
  }
  if (encoder && encoder.state === 'configured') {
    if (encoder.encodeQueueSize > 4) { studio.skipped++; return } // karta nie nadąża — klatka pominięta zamiast opóźnienia
    const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1000) })
    const key = needKey || frameNo % (studio.fps * 2) === 0
    needKey = false
    encoder.encode(vf, { keyFrame: key })
    vf.close()
    frameNo++
  }
}
let scratch = null
function getScratch() { if (!scratch) { scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H } return scratch }

/* ---------- podgląd → wizja ---------- */
const snap = l => ({ ...l, pip: { ...l.pip }, mpos: { ...l.mpos } })
const same = (a, b) => a.scene === b.scene && a.lowerThird === b.lowerThird && a.pip.corner === b.pip.corner && a.pip.size === b.pip.size
  && a.media === b.media && a.omedia === b.omedia && a.ovl === b.ovl && a.mpos.corner === b.mpos.corner && a.mpos.size === b.mpos.size
export const differs = () => !same(studio.preview, studio.program)
function toProgram(fn) {
  const before = snap(studio.program)
  fn(studio.program)
  if (studio.program.lowerThird && !before.lowerThird) studio.program.lowerAt = performance.now()
  if (!studio.program.lowerThird && before.lowerThird) studio.program.lowerOff = performance.now()
  // sam pasek mówcy wjeżdża/wyjeżdża — bez przenikania całego obrazu
  if (!same({ ...before, lowerThird: studio.program.lowerThird }, studio.program)) { progFrom = before; progAt = performance.now() }
}
// Zmiana idzie na podgląd; przy „Od razu na wizję” — też na wizję.
function change(fn) {
  fn(studio.preview)
  if (studio.preview.lowerThird) studio.preview.lowerAt = studio.preview.lowerAt || performance.now()
  if (studio.direct) toProgram(fn)
}
export function setScene(id) { change(l => { l.scene = id }) }
export function toggleLowerThird() { change(l => { l.lowerThird = !l.lowerThird; l[l.lowerThird ? 'lowerAt' : 'lowerOff'] = performance.now() }) }
export function toggleLyrics() { const on = !studio.program.lyricsOn; studio.preview.lyricsOn = on; studio.program.lyricsOn = on }
// Na których scenach są nakładki (na planszach — odliczanie, ogłoszenia, koniec — nie ma ich celowo).
export const OVERLAYS = { lyrics: ['camera', 'projector', 'projectorPip', 'media'], lowerThird: ['camera', 'projectorPip', 'media'], media: ['camera', 'projector', 'projectorPip'] }
export function setPip(p) { change(l => { l.pip = { ...l.pip, ...p } }) }
// „Na wizję”: podgląd przechodzi na wizję (przenikanie), podgląd zostaje bez zmian.
// (napisy mają jeden przełącznik dla podglądu i wizji — „Na wizję” ich nie zmienia)
export function take() { const p = snap(studio.preview); toProgram(l => { Object.assign(l, { scene: p.scene, lowerThird: p.lowerThird, pip: p.pip, media: p.media, omedia: p.omedia, ovl: p.ovl, mpos: p.mpos }) }) }
export function setDirect(v) { studio.direct = !!v; if (v) take() }
// Wygląd na start (zapamiętane okienko): ten sam na podglądzie i wizji.
export function initLook(pip) { for (const l of [studio.preview, studio.program]) l.pip = { ...l.pip, ...pip } }

let pvCanvas = null, pv = null, frameNo2 = 0
const PV = 0.5
export function previewCanvas() {
  if (!pvCanvas) {
    pvCanvas = document.createElement('canvas')
    pvCanvas.width = W * PV; pvCanvas.height = H * PV
    pvCanvas.className = 'studio-canvas'
    pv = pvCanvas.getContext('2d', { alpha: false })
  }
  return pvCanvas
}

// Płótno studia (podgląd w oknie — ten sam obraz, który idzie na YouTube).
export function studioCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    canvas.className = 'studio-canvas'
    g = canvas.getContext('2d', { alpha: false })
  }
  if (!timer) timer = setInterval(frame, 1000 / studio.fps)
  return canvas
}
export function pauseIdle() { if (!studio.live && timer) { clearInterval(timer); timer = 0 } }
export function setFps(fps) {
  studio.fps = [25, 30, 50, 60].includes(+fps) ? +fps : 30
  if (timer) { clearInterval(timer); timer = setInterval(frame, 1000 / studio.fps) }
}

/* ---------- kamera (ATEM po USB) ---------- */
export async function listCameras() {
  const all = await navigator.mediaDevices.enumerateDevices()
  return { video: all.filter(d => d.kind === 'videoinput'), audio: all.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications') }
}
export async function setCamera(deviceId) {
  studio.camera = deviceId || ''
  camStream?.getTracks().forEach(tr => tr.stop())
  camStream = null
  if (!deviceId) return
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: studio.fps } }, audio: false })
    if (!camVideo) { camVideo = document.createElement('video'); camVideo.muted = true; camVideo.playsInline = true }
    camVideo.srcObject = camStream
    await camVideo.play().catch(() => {})
    studio.error = ''
  } catch (e) {
    studio.error = /NotReadable|Abort|TrackStart/.test(e?.name) ? 'Kamera zajęta przez inny program (np. OBS) — zamknij go.' : 'Nie mogę otworzyć kamery: ' + (e?.message || e)
  }
}

/* ---------- dźwięk: ATEM + filmy ze scen → PCM 48 kHz do FFmpeg ---------- */
let meter = null
let ac = null, mix = null, worklet = null, micSource = null, micStream = null, mediaSources = new WeakSet()
const WORKLET = `class Pcm extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(2048 * 2); this.n = 0 }
  process(inputs) {
    const ch = inputs[0], l = ch[0], r = ch[1] || ch[0]
    if (!l) return true
    for (let i = 0; i < l.length; i++) {
      this.buf[this.n++] = Math.max(-32768, Math.min(32767, l[i] * 32767))
      this.buf[this.n++] = Math.max(-32768, Math.min(32767, r[i] * 32767))
      if (this.n >= this.buf.length) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = new Int16Array(2048 * 2); this.n = 0 }
    }
    return true
  }
}
registerProcessor('pcm', Pcm)`
async function audioGraph() {
  if (ac) return
  ac = new AudioContext({ sampleRate: 48000 })
  mix = ac.createGain()
  // cisza jako stałe źródło — dźwięk płynie także bez mikrofonu
  const silence = ac.createConstantSource(); silence.offset.value = 0; silence.connect(mix); silence.start()
  await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })))
  worklet = new AudioWorkletNode(ac, 'pcm', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' })
  worklet.port.onmessage = e => { if (studio.live) api.studioAudio(new Uint8Array(e.data)) }
  mix.connect(worklet)
  // poziom dźwięku (miernik na pulpicie i ostrzeżenie o ciszy)
  meter = ac.createAnalyser(); meter.fftSize = 1024; mix.connect(meter)
  const buf = new Float32Array(meter.fftSize)
  let quietSince = performance.now()
  setInterval(() => {
    meter.getFloatTimeDomainData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
    const db = peak > 0 ? Math.max(-100, Math.round(20 * Math.log10(peak))) : -100
    studio.audioDb = db
    if (db > -55) quietSince = performance.now()
    studio.silentFor = Math.floor((performance.now() - quietSince) / 1000)
  }, 250)
}
function connectMedia(el) {
  audioGraph().then(() => { if (mediaSources.has(el)) return; mediaSources.add(el); ac.createMediaElementSource(el).connect(mix) })
}
export async function setAudio(deviceId) {
  studio.audio = deviceId || ''
  await audioGraph()
  // Także w trakcie transmisji: nowe źródło otwierane, zanim odepniemy stare — dźwięk płynie bez przerwy
  // (mikser ma stałe źródło ciszy, więc nawet chwila bez mikrofonu nie zrywa strumienia do YouTube).
  const oldSource = micSource, oldStream = micStream
  const drop = () => { oldSource?.disconnect(); oldStream?.getTracks().forEach(tr => tr.stop()) }
  micSource = null; micStream = null
  if (!deviceId) { drop(); return }
  try {
    // dźwięk z miksera bez „poprawiania” (bez tłumienia echa i szumów)
    const st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 }, video: false })
    if (studio.audio !== deviceId) { st.getTracks().forEach(tr => tr.stop()); return } // w międzyczasie wybrano inne
    micStream = st
    micSource = ac.createMediaStreamSource(st)
    micSource.connect(mix)
    if (studio.error.startsWith('Nie mogę otworzyć dźwięku')) studio.error = ''
  } catch (e) { studio.error = 'Nie mogę otworzyć dźwięku: ' + (e?.message || e) }
  drop()
}

/* ---------- kodowanie ---------- */
const config = (hw) => ({ codec: 'avc1.640028', width: W, height: H, bitrate: studio.bitrate, framerate: studio.fps, hardwareAcceleration: hw, latencyMode: 'realtime', bitrateMode: 'constant', avc: { format: 'annexb' } })
// Czy karta graficzna zakoduje H.264 1080p (WebCodecs) — od tego zależy studio; bez tego zostaje tryb prosty.
export async function checkHardware() {
  if (typeof VideoEncoder === 'undefined') return (studio.hardware = false)
  try { studio.hardware = !!(await VideoEncoder.isConfigSupported(config('prefer-hardware'))).supported } catch { studio.hardware = false }
  return studio.hardware
}
export async function startEncoding() {
  await audioGraph()
  if (ac.state === 'suspended') await ac.resume()
  encoder?.close?.()
  encoder = new VideoEncoder({
    output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); api.studioVideo(b) },
    error: e => { studio.error = 'Kodowanie obrazu: ' + (e?.message || e) },
  })
  encoder.configure(config('prefer-hardware'))
  studio.encoder = 'karta graficzna (WebCodecs)'
  frameNo = 0; needKey = true; studio.skipped = 0
  studio.live = true
}
export function stopEncoding() {
  studio.live = false
  try { encoder?.close() } catch { /* już zamknięty */ }
  encoder = null
}
// FFmpeg wystartował od nowa (np. po zerwaniu łącza) — następna klatka kluczowa, żeby YouTube od razu miał obraz.
export function requestKeyFrame() { needKey = true }
// stan dźwięku (konsola i testy)
export const audioInfo = () => ({ state: ac?.state || 'brak', rate: ac?.sampleRate, mic: micStream?.getAudioTracks().map(t => t.label + ' · ' + t.readyState + (t.muted ? ' · wyciszony' : '')) || [], settings: micStream?.getAudioTracks()[0]?.getSettings() })
