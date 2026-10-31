// Grafika plakatowa plansz: chropowate napisy i panele z poszarpaną krawędzią, kurz i rysowanie gór (to samo co w tle
// aplikacji). Gotowe elementy trzymane w pamięci — rysowane raz, potem tylko wstawiane do klatki.
import { H, W } from './state'
import { fontStr, g, type Font } from './paint'
import { SKETCH_PATHS } from './sketchPaths'

const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c }
const hash = (str: string) => { let x = 7; for (const c of str) x = (x * 31 + c.charCodeAt(0)) % 2147483647; return x || 1 }
// pamięć gotowych elementów: najstarsze wypadają (zegar co sekundę dokłada nowy napis)
const cache = new Map<string, HTMLCanvasElement>()
function kept(key: string, make: () => HTMLCanvasElement) {
  let c = cache.get(key)
  if (!c) { c = make(); cache.set(key, c); if (cache.size > 240) cache.delete(cache.keys().next().value) }
  return c
}

// faktura zużycia: drobinki i rysy wycinane z napisów i paneli
let specks: HTMLCanvasElement = null
function wear() {
  if (specks) return specks
  specks = canvas(1024, 1024)
  const p = specks.getContext('2d'), r = seeded(41)
  p.fillStyle = '#000'
  for (let i = 0; i < 5200; i++) { const s = 0.4 + r() * r() * 3.4; p.globalAlpha = 0.35 + r() * 0.65; p.beginPath(); p.arc(r() * 1024, r() * 1024, s, 0, Math.PI * 2); p.fill() }
  p.strokeStyle = '#000'
  for (let i = 0; i < 120; i++) { p.globalAlpha = 0.2 + r() * 0.5; p.lineWidth = 0.5 + r() * 1.4; const x = r() * 1024, y = r() * 1024; p.beginPath(); p.moveTo(x, y); p.lineTo(x + (r() - 0.5) * 90, y + (r() - 0.5) * 34); p.stroke() }
  return specks
}
function scuff(p: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  p.save(); p.globalCompositeOperation = 'destination-out'
  const sx = -(seed % 512), sy = -((seed >> 4) % 512)
  for (let x = sx; x < w; x += 1024) for (let y = sy; y < h; y += 1024) p.drawImage(wear(), x, y)
  p.restore()
}

type RoughOpts = { size?: number, color?: string, align?: 'left' | 'center' | 'right', font?: Font, weight?: number, spacing?: number, alpha?: number }
// Napis plakatowy z wytartą fakturą; y — linia bazowa, jak w text().
export function roughText(str: string, x: number, y: number, { size = 120, color = '#f1e9dc', align = 'left', font = 'poster', weight = 400, spacing = 0, alpha = 1 }: RoughOpts = {}) {
  if (!str) return
  const key = ['t', str, size, color, font, weight, spacing].join('|')
  const pad = Math.ceil(size * 0.3)
  const c = kept(key, () => {
    const probe = canvas(4, 4).getContext('2d')
    probe.font = fontStr(weight, size, font); probe.letterSpacing = spacing + 'px'
    const cv = canvas(probe.measureText(str).width + pad * 2, size * 1.5), p = cv.getContext('2d')
    p.font = fontStr(weight, size, font); p.letterSpacing = spacing + 'px'; p.fillStyle = color; p.textBaseline = 'alphabetic'
    p.fillText(str, pad, size * 1.2)
    scuff(p, cv.width, cv.height, hash(str))
    return cv
  })
  const left = (align === 'center' ? x - (c.width - pad * 2) / 2 : align === 'right' ? x - (c.width - pad * 2) : x) - pad
  g.save(); g.globalAlpha *= alpha; g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = size * 0.1; g.shadowOffsetY = size * 0.03
  g.drawImage(c, left, y - size * 1.2)
  g.restore()
}
// Zegar: każda cyfra w komórce tej samej szerokości — liczby nie skaczą przy zmianie sekund.
export function clockWidth(str: string, size: number, font: Font, weight: number, italic = false) {
  g.save(); g.font = fontStr(weight, size, font, italic)
  const cell = Math.max(...[...'0123456789'].map(d => g.measureText(d).width))
  g.restore()
  return [...str].reduce((s, c) => s + (/d/.test(c) ? cell : c === ':' ? cell * 0.55 : cell), 0)
}
export function steady(draw: (ch: string, x: number) => void, str: string, x: number, size: number, font: Font, weight: number, align: 'left' | 'center' | 'right' = 'left', italic = false) {
  g.save(); g.font = fontStr(weight, size, font, italic)
  const cell = Math.max(...[...'0123456789'].map(d => g.measureText(d).width)), colon = cell * 0.55
  g.restore()
  const chars = [...str], width = chars.reduce((s, c) => s + (c === ':' ? colon : cell), 0)
  let at = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x
  for (const c of chars) { const w = c === ':' ? colon : cell; draw(c, at + w / 2); at += w }
  return width
}
export const roughClock = (str: string, x: number, y: number, o: RoughOpts & { align?: 'left' | 'center' | 'right' }) => steady((c, cx) => roughText(c, cx, y, { ...o, align: 'center' }), str, x, o.size, o.font || 'poster', 400, o.align)
// największy rozmiar, przy którym napis mieści się w szerokości
export function roughFit(str: string, maxW: number, size: number, min = 32, font: Font = 'poster', spacing = 0) {
  g.save()
  let s = size
  for (; s > min; s -= 2) { g.font = fontStr(400, s, font); g.letterSpacing = spacing + 'px'; if (g.measureText(str).width <= maxW) break }
  g.restore()
  return s
}

// Panel z matowego szkła: półprzezroczysty, zaokrąglony, z cienką jasną obwódką — tło prześwituje pod spodem.
export function glassPanel(x: number, y: number, w: number, h: number, tint = 'rgba(16,10,6,0.66)') {
  g.save()
  g.beginPath(); g.roundRect(x, y, w, h, 20); g.fillStyle = tint; g.fill()
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,240,220,0.26)'; g.stroke()
  g.restore()
}
// Pas u dołu kadru: miękko wyłania się z obrazu, od góry cienka linia w kolorze akcentu.
export function bottomBand(y: number, color = 'rgba(16,10,6,0.9)', line = '') {
  const gr = g.createLinearGradient(0, y - 90, 0, y + 50), clear = color.replace(/[\d.]+\)$/, '0)')
  gr.addColorStop(0, clear); gr.addColorStop(1, color)
  g.fillStyle = gr; g.fillRect(0, y - 90, W, H - y + 90)
  if (line) { g.fillStyle = line; g.fillRect(0, H - 6, W, 6) }
}
// cienka linia pod nazwą
export const hairline = (x: number, y: number, w: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, 3) }

// Unoszący się kurz: spokojny, mało widoczny ruch w tle plansz.
const MOTES = (() => { const r = seeded(77); return Array.from({ length: 46 }, () => ({ x: r() * W, y: r() * H, s: 1 + r() * 2.6, v: 6 + r() * 16, a: 0.12 + r() * 0.3 })) })()
export function dust(t: number) {
  g.save(); g.fillStyle = '#ffd9a8'
  for (const m of MOTES) {
    const k = t / 1000
    g.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(k * 0.7 + m.x))
    g.beginPath(); g.arc((m.x + k * m.v) % W, (m.y - k * m.v * 0.45 + H * 40) % H, m.s, 0, Math.PI * 2); g.fill()
  }
  g.restore()
}
// przyciemnienie pod napisy: od lewej i od dołu
export function shade(from = 0.62, width = 0.62) {
  const a = g.createLinearGradient(0, 0, W * width, 0); a.addColorStop(0, `rgba(14,8,4,${from})`); a.addColorStop(1, 'rgba(14,8,4,0)')
  g.fillStyle = a; g.fillRect(0, 0, W, H)
  const b = g.createLinearGradient(0, H - 300, 0, H); b.addColorStop(0, 'rgba(14,8,4,0)'); b.addColorStop(1, 'rgba(14,8,4,0.72)')
  g.fillStyle = b; g.fillRect(0, H - 300, W, 300)
}

/* ---------- rysowanie gór (to samo co w tle aplikacji) ---------- */
const LOOK = { far: [1.1, 0.34], edge: [2.2, 0.85], ridge: [1.9, 0.72], rib: [1.5, 0.55], side: [1.8, 0.62], hatch: [1, 0.42], light: [0.9, 0.28], back: [1.4, 0.36], cross: [4.5, 1] }
const lineOf = (cls: string) => { const n = cls.split(' '), key = n.includes('back') ? 'back' : n.includes('light') ? 'light' : n[0] in LOOK ? n[0] : 'edge'; return LOOK[key] }
const pathLen = (d: string) => { let len = 0, x = 0, y = 0; for (const m of d.matchAll(/([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)) { const a = +m[2], b = +m[3]; if (m[1] === 'L') len += Math.hypot(a - x, b - y); x = a; y = b } return len }
let strokes: { path: Path2D, len: number, at: number, dur: number, width: number, alpha: number, cross: boolean }[] = null
function sketchStrokes() {
  strokes ||= SKETCH_PATHS.map(([cls, at, dur, d]) => { const [width, alpha] = lineOf(cls.replace('kb-', '')); return { path: new Path2D(d), len: pathLen(d), at: at * 1000, dur: dur * 1000, width, alpha, cross: cls.includes('cross') } }).sort((a, b) => a.at + a.dur - b.at - b.dur)
  return strokes
}
// te same proporcje co tło aplikacji: rysunek przy dolnej krawędzi; szczyt z prawej, po lewej miejsce na napisy
// gdzie stoi góra: [x szczytu, skala, y podnóża rysunku]
export type Place = [number, number, number]
export const PEAK_AT: Place = [W * 0.66, H / 840, H]
const place = (p: CanvasRenderingContext2D, [x, s, bottom]: Place) => p.transform(s, 0, 0, s, x - 700 * s, bottom - 1000 * s)
function stroke(p: CanvasRenderingContext2D, s, color: string, part = 1, base = 1, cross = '#f6a836') {
  p.lineWidth = s.width; p.globalAlpha = s.alpha * base; p.strokeStyle = s.cross ? cross : color
  p.setLineDash(part < 1 ? [s.len * part, s.len] : [])
  if (s.cross) { p.shadowColor = cross; p.shadowBlur = 16 }
  p.stroke(s.path)
  p.shadowBlur = 0
}
const CYCLE = 60000, FADE = 2500 // rysunek powstaje przez ok. 7 s, stoi, a pod koniec minuty gaśnie i rysuje się od nowa
let live: HTMLCanvasElement = null, liveKey = '', drawn = 0, lastT = 0
const whole = new Map<string, HTMLCanvasElement>()
const sketchLayer = (at: Place) => { const c = canvas(W, H), p = c.getContext('2d'); p.lineCap = 'round'; p.lineJoin = 'round'; place(p, at); return c }
// Góry rysujące się kreską na tle planszy; full — od razu cały rysunek (miniatury).
export function drawSketch(t: number, full = false, color = '#f3e3c8', at: Place = PEAK_AT, cross = '#f6a836') {
  const list = sketchStrokes(), key = color + cross + at.join()
  if (full) {
    if (!whole.has(key)) { const c = sketchLayer(at), p = c.getContext('2d'); for (const s of list) stroke(p, s, color, 1, 1, cross); whole.set(key, c) }
    g.drawImage(whole.get(key), 0, 0, W, H); return
  }
  const T = t % CYCLE
  if (!live || T < lastT || key !== liveKey) { live = sketchLayer(at); liveKey = key; drawn = 0 }
  lastT = T
  const p = live.getContext('2d')
  while (drawn < list.length && list[drawn].at + list[drawn].dur <= T) stroke(p, list[drawn++], color, 1, 1, cross)
  g.save(); g.globalAlpha *= T > CYCLE - FADE ? (CYCLE - T) / FADE : 1
  g.drawImage(live, 0, 0, W, H)
  g.lineCap = 'round'; g.lineJoin = 'round'; place(g, at)
  for (let i = drawn; i < list.length; i++) { const s = list[i]; if (s.at < T) { const a = g.globalAlpha; stroke(g, s, color, (T - s.at) / s.dur, a, cross); g.globalAlpha = a } }
  g.restore()
}
