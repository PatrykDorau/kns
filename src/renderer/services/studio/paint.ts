// Rysowanie na płótnie: bieżący kontekst (g) i wygląd, który właśnie rysujemy (S — wizja albo podgląd),
// obrazy z pamięci podręcznej i pomocnicze (dopasowanie, tekst, zawijanie, tło).
import type { Look } from '@/types'
import { H, W } from './state'

export let g: CanvasRenderingContext2D = null
export let S: Look = null
// Rysuj na tym płótnie ten wygląd; zwraca poprzednie, żeby je przywrócić.
export function paintOn(ctx: CanvasRenderingContext2D, look: Look) {
  const prev = { ctx: g, look: S }
  g = ctx; S = look
  return prev
}
const images = new Map() // adres → obraz (grafiki ogłoszeń, logo, rzutnik)

/* ---------- pomocnicze ---------- */
export function img(url) {
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
export function fit(src, sw, sh, x, y, w, h, mode = 'contain') {
  const s = mode === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh)
  const dw = sw * s, dh = sh * s
  g.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}
export function rounded(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r) }
// Grafika na cały kadr: rozmyte tło z tej samej grafiki + grafika w całości.
export function fullImage(im) {
  g.save(); g.filter = 'blur(40px) brightness(0.45)'; fit(im, im.naturalWidth, im.naturalHeight, -60, -60, W + 120, H + 120, 'cover'); g.restore()
  fit(im, im.naturalWidth, im.naturalHeight, 0, 0, W, H, 'contain')
}
// Tło planszy: ciemne, z wolno płynącymi plamami w kolorach kościoła.
export function background(t) {
  g.fillStyle = '#0f1013'; g.fillRect(0, 0, W, H)
  const blob = (cx, cy, r, color) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(15,16,19,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
  blob(W * (0.25 + 0.08 * Math.sin(t / 7000)), H * (0.3 + 0.1 * Math.cos(t / 9000)), 900, 'rgba(232,163,61,0.32)')
  blob(W * (0.8 + 0.06 * Math.cos(t / 8000)), H * (0.75 + 0.08 * Math.sin(t / 6000)), 800, 'rgba(224,122,95,0.26)')
  blob(W * (0.6 + 0.1 * Math.sin(t / 11000)), H * 0.1, 600, 'rgba(169,139,255,0.12)')
}
// Czcionki: zwykła (Segoe UI), wąska plakatowa (Bahnschrift Condensed — jest w Windows 10/11) i szeryfowa (Georgia).
export const FAMILY = { ui: '"Segoe UI", system-ui, sans-serif', cond: '"Bahnschrift Condensed", Bahnschrift, Impact, sans-serif', serif: 'Georgia, "Palatino Linotype", serif' }
export type Font = keyof typeof FAMILY
export const fontStr = (weight, size, font: Font = 'ui', italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${FAMILY[font] || FAMILY.ui}`
export function text(str, x, y, { size = 48, weight = 600, color = '#fff', align = 'left', alpha = 1, shadow = 0, font = 'ui' as Font, italic = false, spacing = 0 } = {}) {
  g.save()
  g.globalAlpha *= alpha
  g.font = fontStr(weight, size, font, italic)
  if (spacing) g.letterSpacing = spacing + 'px'
  g.fillStyle = color; g.textAlign = align as CanvasTextAlign; g.textBaseline = 'alphabetic'
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = shadow; g.shadowOffsetY = shadow / 6 }
  g.fillText(str, x, y)
  g.restore()
}
// Tekst w kilku liniach (zawijanie po słowach), najwyżej max linii.
export function wrap(str, width, size, weight, max, font: Font = 'ui') {
  g.save(); g.font = fontStr(weight, size, font)
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
// Jedna linia, która musi się zmieścić: najpierw mniejsza czcionka (do min), potem skrót z „…”.
export function fitLine(str, maxW, size, min, weight, font: Font = 'ui', italic = false) {
  g.save()
  const width = sz => { g.font = fontStr(weight, sz, font, italic); return g.measureText(str).width }
  while (size > min && width(size) > maxW) size -= 2
  let out = String(str)
  if (width(size) > maxW) {
    g.font = fontStr(weight, size, font, italic)
    while (out.length > 1 && g.measureText(out + '…').width > maxW) out = out.slice(0, -1)
    out = out.replace(/[\s·,.-]+$/, '') + '…'
  }
  g.restore()
  return { str: out, size }
}
