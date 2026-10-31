// Scena „Życie kościoła”: ramka w kształcie L. Kamera w dużym oknie, z prawej ogłoszenia w pętli, u dołu napis, najbliższe
// wydarzenia i kod QR. Po wejściu w scenę kamera płynnie zmniejsza się z pełnego kadru, a ramka się pojawia.
import { churchEvents, today } from '@/stores'
import { H, W } from './state'
import { S, fitLine, g, rounded, text, wrap } from './paint'
import { carouselStack, cdBackground, drawSlide, lifeLook } from './cards'
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
const short = (date: string) => new Date(date + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short' })

export function drawLife(t: number, qrs: (L) => { qr?: string, phone?: string }[], tile: (q, x: number, y: number, size: number, label: string) => void, logo: (x: number, y: number, size: number, ring: boolean) => void, sample = false) {
  const L = lifeLook(), seen = lastDraw.get(S) ?? -1e9
  if (t - seen > 400) enteredAt.set(S, t)
  lastDraw.set(S, t)
  const k = sample ? 1 : ease(Math.min(1, (t - (enteredAt.get(S) ?? t)) / ENTER))

  cdBackground(L, t, false)
  const onLight = LIGHT_BG.includes(L.bg), ink = onLight ? cleanInk(L.bg).ink : '#f4ecdf', soft = onLight ? ink : '#fbe3bd'
  if (!onLight) shade(0.35, 0.5)

  const stack = L.ann === false ? [] : carouselStack(t, 2), events = L.events === false ? [] : publicEvents()
  const q = qrs(L)[0], hasBottom = !!(L.title || L.brand || events.length || q)
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
  if (!sample) {
    g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30 * k; rounded(fx, fy, fw, fh, r); g.fillStyle = '#000'; g.fill(); g.restore()
    g.save(); rounded(fx, fy, fw, fh, r); g.clip(); drawCamera(fx, fy, fw, fh); g.restore()
  } else { // miniatura presetu: miejsce na kamerę
    rounded(fx, fy, fw, fh, r); g.fillStyle = 'rgba(12,10,8,0.82)'; g.fill()
    text('Kamera', fx + fw / 2, fy + fh / 2, { size: 72, weight: 400, font: 'display', color: '#f4ecdf', align: 'center' })
  }
}
