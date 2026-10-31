// Scena „Życie kościoła”, trzy układy, w każdym baner można wyłączyć. Pływający: kamera w oknie na tle, ogłoszenie nachodzi
// na nią z prawej, baner w jej rogu. Boczny: kamera na całą wysokość, z prawej pas ogłoszeń jadących jedno za drugim, lekko
// nachodzących na obraz, a na kamerze mała plakietka z napisem, wydarzeniami i kodem QR. Ramka: kamera w dużym oknie,
// ogłoszenia obok, u dołu pas. Po wejściu w scenę kamera płynnie zmniejsza się z pełnego kadru, a reszta się pojawia.
import { churchEvents, today } from '@/stores'
import { H, W, studio } from './state'
import { S, fitLine, g, rounded, text, wrap } from './paint'
import { carousel, carouselStack, cdBackground, drawCarousel, drawSlide, lifeLook, slides } from './cards'
import { drawCamera } from './camera'
import { LIGHT_BG } from './backgrounds'
import { cleanInk } from './clean'
import { glassPanel, shade } from './rough'

const M = 36, FRAME = { x: M, y: M, w: 1370, h: 770 }, ENTER = 900
const lastDraw = new WeakMap<object, number>(), enteredAt = new WeakMap<object, number>()
const ease = (k: number) => 1 - Math.pow(1 - k, 3)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

// tylko to, co można pokazać publicznie: zaznaczone „Pokaż na nabożeństwie” i dla wszystkich (jak ogłoszenia)
export function publicEvents(max = 3) {
  return churchEvents.value
    .filter(e => e.projector && (e.audience || 'public') === 'public' && e.date && e.date >= today())
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, max)
}
// Układ boczny: stałe wymiary (kamera, karty ogłoszeń i ile nachodzą na obraz)
const CAM_W = 1500, CARD_W = 500, CARD_H = CARD_W * 9 / 16, CARD_GAP = 28, OVERLAP = 116
// Układ pływający: proporcje ze szkicu
const FLOAT = { cam: { x: 116, y: 96, w: 1360, h: 888 }, ann: { x: 1050, y: 340, w: 800, h: 450 } }
const short = (date: string) => new Date(date + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short' })

function cameraIn(x: number, y: number, w: number, h: number, r: number, sample: boolean) {
  if (!sample) { g.save(); rounded(x, y, w, h, r); g.clip(); drawCamera(x, y, w, h); g.restore(); return }
  rounded(x, y, w, h, r); g.fillStyle = 'rgba(12,10,8,0.82)'; g.fill() // miniatura presetu: miejsce na kamerę
  text('Kamera', x + w / 2, y + h / 2, { size: 72, weight: 400, font: 'display', color: '#f4ecdf', align: 'center' })
}
// Ogłoszenia jadą w górę jednym ciągiem, w kółko; tempo z „Zmiana co”: jedna karta na tyle sekund.
function drawFeed(t: number, x: number) {
  const list = slides(), pitch = CARD_H + CARD_GAP
  const card = (sl, y) => {
    g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 26; g.shadowOffsetY = 8; rounded(x, y, CARD_W, CARD_H, 14); g.fillStyle = '#000'; g.fill(); g.restore()
    g.save(); rounded(x, y, CARD_W, CARD_H, 14); g.clip(); drawSlide(sl, x, y, CARD_W, CARD_H); g.restore()
  }
  if (list.length === 1) { card(list[0], (H - CARD_H) / 2); return } // jedno ogłoszenie stoi
  const every = Math.max(3, +studio.slideEvery || 8) * 1000, moved = (t / every) * pitch, base = Math.floor(moved / pitch), shift = moved - base * pitch
  for (let i = 0; i * pitch - shift < H; i++) card(list[(base + i) % list.length], i * pitch - shift + 20)
}
function drawSide(L, t: number, k: number, qrs, tile, logo, sample: boolean) {
  cdBackground(L, t, false)
  const onLight = LIGHT_BG.includes(L.bg), hasFeed = L.ann !== false && slides().length > 0
  // bez ogłoszeń kamera bierze cały kadr
  const camW = hasFeed ? mix(W, CAM_W, k) : W
  cameraIn(0, 0, camW, H, 0, sample)
  if (hasFeed) {
    g.save(); g.globalAlpha *= k
    const edge = g.createLinearGradient(camW - 150, 0, camW, 0); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.42)')
    g.fillStyle = edge; g.fillRect(camW - 150, 0, 150, H)
    g.restore()
    drawFeed(t, mix(W + 40, CAM_W - OVERLAP, k))
  }
  if (L.banner !== false) plaque(L, 32, H - 168, k, qrs, tile, logo, 2)
}
// Plakietka na kamerze: logo, napis, wydarzenia, kod QR; pusta — nie ma jej wcale.
function plaque(L, x: number, y: number, k: number, qrs, tile, logo, showEvents: number) {
  const onLight = LIGHT_BG.includes(L.bg)
  const events = L.events === false ? [] : publicEvents(showEvents), q = qrs(L)[0]
  if (!L.title && !L.brand && !events.length && !q) return
  const h = 136, ew = 270, tw = L.title || L.brand ? 470 : 0, w = 124 + tw + events.length * ew + (q ? h : 0)
  g.save(); g.globalAlpha *= k
  glassPanel(x, y, w, h, onLight ? 'rgba(255,250,240,0.9)' : 'rgba(16,10,6,0.8)')
  const ink = L.ink || (onLight ? '#2b2b2b' : '#f4ecdf'), soft = L.ink || (onLight ? ink : '#fbe3bd')
  logo(x + 20, y + 26, 84, !onLight)
  if (L.brand) text(L.brand.toUpperCase(), x + 124, y + (L.title ? 50 : 78), { size: 24, weight: 700, font: 'sans', color: soft })
  if (L.title) { const f = fitLine(L.title, tw - 20, 44, 26, 400, 'display'); text(f.str, x + 122, y + (L.brand ? 102 : 84), { size: f.size, weight: 400, font: 'display', color: ink }) }
  events.forEach((e, i) => {
    const ax = x + 124 + tw + i * ew
    g.fillStyle = onLight ? ink : 'rgba(255,240,220,0.3)'; g.fillRect(ax - 14, y + 26, 2, h - 52)
    text(short(e.date) + (e.time ? ' · ' + e.time : ''), ax, y + 50, { size: 23, weight: 700, font: 'sans', color: soft })
    wrap(String(e.title || ''), ew - 30, 26, 700, 2, 'sans').forEach((l, n) => text(l, ax, y + 86 + n * 32, { size: 26, weight: 700, font: 'sans', color: ink }))
  })
  if (q) tile(q, x + w - h + 12, y + 12, h - 24, '')
  g.restore()
}
// Układ pływający: kamera w dużym oknie na tle, ogłoszenie nachodzi na nią z prawej, mały baner w jej lewym dolnym rogu.
function drawFloat(L, t: number, k: number, qrs, tile, logo, sample: boolean) {
  cdBackground(L, t, false)
  const c = L.ann === false ? null : carousel(t), box = FLOAT.cam
  const x = mix(0, box.x, k), y = mix(0, box.y, k), w = mix(W, box.w, k), h = mix(H, box.h, k), r = 18 * k
  if (!sample) { g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 36 * k; rounded(x, y, w, h, r); g.fillStyle = '#000'; g.fill(); g.restore() }
  cameraIn(x, y, w, h, r, sample)
  if (L.banner !== false) plaque(L, box.x + 36, box.y + box.h - 136 - 36, k, qrs, tile, logo, 0)
  if (c) {
    const a = FLOAT.ann, cx = mix(W + 40, a.x, k)
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40; g.shadowOffsetY = 12; rounded(cx, a.y, a.w, a.h, 16); g.fillStyle = '#000'; g.fill(); g.restore()
    g.save(); rounded(cx, a.y, a.w, a.h, 16); g.clip(); drawCarousel(c, cx, a.y, a.w, a.h); g.restore()
  }
}

export function drawLife(t: number, qrs: (L) => { qr?: string, phone?: string }[], tile: (q, x: number, y: number, size: number, label: string) => void, logo: (x: number, y: number, size: number, ring: boolean) => void, sample = false) {
  const L = lifeLook(), seen = lastDraw.get(S) ?? -1e9
  if (t - seen > 400) enteredAt.set(S, t)
  lastDraw.set(S, t)
  // animacja tylko na żywym podglądzie i wizji; przy wyjściu ze sceny przenikanie rysuje jej kopię, gotową, bez wejścia
  const live = S === studio.program || S === studio.preview
  const k = sample || !live ? 1 : ease(Math.min(1, (t - (enteredAt.get(S) ?? t)) / ENTER))

  if (L.layout === 'float') { drawFloat(L, t, k, qrs, tile, logo, sample); return }
  if (L.layout !== 'frame') { drawSide(L, t, k, qrs, tile, logo, sample); return }
  cdBackground(L, t, false)
  const onLight = LIGHT_BG.includes(L.bg), ink = L.ink || (onLight ? cleanInk(L.bg).ink : '#f4ecdf'), soft = L.ink || (onLight ? ink : '#fbe3bd')
  if (!onLight) shade(0.35, 0.5)

  const stack = L.ann === false ? [] : carouselStack(t, 2), events = L.events === false ? [] : publicEvents()
  const q = qrs(L)[0], hasBottom = L.banner !== false && !!(L.title || L.brand || events.length || q)
  // bez ogłoszeń kamera staje na środku; bez dolnego pasa jest większa
  const h = hasBottom ? FRAME.h : H - 2 * M, w = h * 16 / 9, x = stack.length ? FRAME.x : (W - w) / 2, y = FRAME.y

  g.save(); g.globalAlpha *= k
  // ogłoszenia z prawej: jedno pod drugim
  const cw = W - (x + w) - 2 * M + 8, ch = cw * 9 / 16, cx = x + w + M - 8
  stack.forEach((sl, i) => {
    const sy = y + i * (ch + 24)
    g.save(); rounded(cx, sy, cw, ch, 12); g.clip(); drawSlide(sl, cx, sy, cw, ch); g.restore()
  })
  // dolny pas: napis, wydarzenia, kod QR
  if (hasBottom) {
    const by = y + h + 24, bh = H - by - M, bw = W - 2 * M
    glassPanel(M, by, bw, bh, onLight ? 'rgba(255,255,255,0.5)' : undefined)
    logo(M + 26, by + (bh - 104) / 2, 104, !onLight)
    if (L.brand) text(L.brand.toUpperCase(), M + 160, by + 66, { size: 30, weight: 700, font: 'sans', color: soft })
    if (L.title) { const f = fitLine(L.title, 500, 66, 38, 400, 'display'); text(f.str, M + 158, by + 146, { size: f.size, weight: 400, font: 'display', color: ink }) }
    const qs = q ? bh - 28 : 0, ex = 720, ew = (M + bw - 30 - (q ? qs + 40 : 0) - ex) / Math.max(1, events.length)
    events.forEach((e, i) => {
      const ax = ex + i * ew
      g.fillStyle = onLight ? ink : 'rgba(255,240,220,0.3)'; g.fillRect(ax - 22, by + 34, 2, bh - 68)
      text(short(e.date) + (e.time ? ' · ' + e.time : ''), ax, by + 70, { size: 28, weight: 700, font: 'sans', color: soft })
      wrap(String(e.title || ''), ew - 44, 34, 700, 2, 'sans').forEach((l, n) => text(l, ax, by + 118 + n * 42, { size: 34, weight: 700, font: 'sans', color: ink }))
    })
    if (q) tile(q, M + bw - qs - 18, by + 14, qs, '')
  }
  g.restore()

  // kamera: z pełnego kadru do swojego okna
  const fx = mix(0, x, k), fy = mix(0, y, k), fw = mix(W, w, k), fh = mix(H, h, k), r = 16 * k
  if (!sample) { g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30 * k; rounded(fx, fy, fw, fh, r); g.fillStyle = '#000'; g.fill(); g.restore() }
  cameraIn(fx, fy, fw, fh, r, sample)
}
