// Czyste plansze, każda z własną kompozycją: Krem — podział z blokiem koloru po prawej, Piasek — wielki napis u dołu i okręgi
// w tle, Czerń — wszystko na środku, na rozmytym, czarno-białym zdjęciu skały.
import { H, W } from './state'
import { fontStr, g, img, rounded, text } from './paint'
import type { Place } from './rough'
import { LIGHT_BG } from './backgrounds'

export const CLEAN: Record<string, { bg: string, ink: string, accent: string, line: string, at: Place, clip?: [number, number], alpha: number }> = {
  krem: { bg: '#fbf3e6', ink: '#1a2a9a', accent: '#1a2a9a', line: '#fbf3e6', at: [W * 0.8, 0.86, H * 1.03], clip: [1120, 800], alpha: 0.6 },
  piasek: { bg: '#e2d9cd', ink: '#2c0f14', accent: '#e8525f', line: '#e8525f', at: [W * 0.84, 0.62, H * 0.99], alpha: 0.5 },
  czern: { bg: '#0d0d0d', ink: '#f5e66c', accent: '#f5e66c', line: '#f5e66c', at: [W * 0.5, 1.2, H * 1.18], alpha: 0.26 },
}
// Dobrane zestawy kolorów każdego tła: [kolor tekstu, kolor zegara]; pierwszy włącza się razem z tłem.
const LIVE: [string, string][] = [['#ffffff', '#f6a836'], ['#ffffff', '#f5e66c'], ['#f4ecdf', '#ff6b4a'], ['#ffffff', '#ffffff'], ['#ffffff', '#7fe0c3'], ['#ffffff', '#7ab8ff'], ['#fff1dc', '#ffb3a0'], ['#f5e66c', '#f5e66c']]
const PAPER: [string, string][] = [['#2b2b2b', '#b5651d'], ['#1a2a9a', '#1a2a9a'], ['#2c0f14', '#c93a48'], ['#0f4c3a', '#0f4c3a'], ['#3d1442', '#a61e6e'], ['#08444f', '#0a6b75'], ['#2b2b2b', '#2b2b2b'], ['#3b2415', '#8a4b12']]
export const PALETTES: Record<string, [string, string][]> = {
  szczyt: [['#f4ecdf', '#f6a836'], ['#ffffff', '#ffd27a'], ['#fbe3bd', '#ff8a3d'], ['#fff8ec', '#ff6b4a'], ['#f4ecdf', '#7fe0c3'], ['#ffe9c8', '#ffffff'], ['#ffffff', '#f5e66c'], ['#fff1dc', '#ffb3a0']],
  swit: [['#fff4ea', '#ffd9a8'], ['#ffffff', '#ffb39a'], ['#fbe3bd', '#ffe9c8'], ['#ffffff', '#ffd166'], ['#fff4ea', '#ffc2d4'], ['#ffe9f0', '#ffffff'], ['#fbe3bd', '#9be7ff'], ['#ffffff', '#b9f3d0']],
  noc: [['#f4ecdf', '#f5c96b'], ['#e4ecff', '#9fc0ff'], ['#ffffff', '#f6a836'], ['#f4ecdf', '#ff8fa3'], ['#ffffff', '#7fe0c3'], ['#e4ecff', '#ffffff'], ['#fff1dc', '#c9a7ff'], ['#ffffff', '#f5e66c']],
  zar: [['#fff1dc', '#ffd27a'], ['#ffffff', '#ffb65c'], ['#fbe3bd', '#fff1dc'], ['#ffffff', '#ffe9a8'], ['#fff1dc', '#ffffff'], ['#ffe3c8', '#ffc9a3'], ['#ffffff', '#ffd94a'], ['#fbe3bd', '#ffd27a']],
  krem: [['#1a2a9a', '#1a2a9a'], ['#2c0f14', '#c8531d'], ['#0f4c3a', '#0f4c3a'], ['#4a1942', '#b02a7a'], ['#0b4f5c', '#0e7c86'], ['#2b2b2b', '#c8531d'], ['#6d1a2c', '#6d1a2c'], ['#0b3d91', '#c2285a']],
  piasek: [['#2c0f14', '#c93a48'], ['#2c0f14', '#2c0f14'], ['#1a2a9a', '#1a2a9a'], ['#0f4c3a', '#b3401f'], ['#3d1442', '#a61e6e'], ['#08444f', '#0a6b75'], ['#1c1c1c', '#b3401f'], ['#3b2415', '#8a4b12']],
  czern: [['#f5e66c', '#f5e66c'], ['#ffffff', '#f5e66c'], ['#f4ecdf', '#f6a836'], ['#ffffff', '#ff5a5f'], ['#ffffff', '#4fd1c5'], ['#f4ecdf', '#c9a7ff'], ['#ffffff', '#7ab8ff'], ['#f5e66c', '#ffffff']],
  paper: PAPER,
  sketch: PAPER,
  camera: LIVE,
  image: LIVE,
  colors: LIVE,
}
export const isClean = (id: string) => id in CLEAN
// kolory napisów układu „Czysty” także na innych tłach
export const cleanInk = (id: string) => CLEAN[id] || { ink: LIGHT_BG.includes(id) ? '#2b2b2b' : '#f4ecdf' }

let dark: HTMLCanvasElement = null
// blok Kremu należy do układu „Czysty” — w innych układach przecinałby zegar i napisy
export const hasBlock = (id: string, layout: string) => id === 'krem' && layout === 'edit'
export function cleanBackground(id: string, layout: string, ink = '') {
  const c = CLEAN[id]
  g.fillStyle = c.bg; g.fillRect(0, 0, W, H)
  if (hasBlock(id, layout)) { g.fillStyle = ink || c.ink; g.fillRect(1120, 0, 800, H) }
  if (id === 'piasek') {
    g.save(); g.strokeStyle = c.accent; g.lineWidth = 2; g.globalAlpha = 0.42
    for (const [x, y, r] of [[1500, 90, 330], [1830, 380, 300], [1190, 330, 230], [1560, 560, 240], [1890, 900, 330], [1010, 60, 170]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke() }
    g.restore()
  }
  if (id !== 'czern') return
  const stone = img('./tla/kamien.jpg')
  if (!stone) return
  if (!dark) {
    dark = document.createElement('canvas'); dark.width = W; dark.height = H
    const p = dark.getContext('2d')
    p.filter = 'grayscale(1) blur(16px) brightness(0.32) contrast(1.15)'
    p.drawImage(stone, -60, -60, W + 120, H + 120)
  }
  g.drawImage(dark, 0, 0, W, H)
}
// Pigułka z napisem (data, nabożeństwo); zwraca szerokość.
export function pill(str: string, x: number, y: number, ink: string) {
  const label = str.toUpperCase(), size = 33, h = 60
  g.save(); g.font = fontStr(700, size, 'sans'); const w = g.measureText(label).width + 44; g.restore()
  g.save(); g.lineWidth = 3; g.strokeStyle = ink; rounded(x, y, w, h, h / 2); g.stroke(); g.restore()
  text(label, x + 22, y + 42, { size, weight: 700, font: 'sans', color: ink })
  return w
}
