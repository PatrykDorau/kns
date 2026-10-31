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
export const isClean = (id: string) => id in CLEAN
// kolory napisów układu „Czysty” także na innych tłach
export const cleanInk = (id: string) => CLEAN[id] || { ink: LIGHT_BG.includes(id) ? '#2b2b2b' : '#f4ecdf' }

let dark: HTMLCanvasElement = null
// blok Kremu należy do układu „Czysty” — w innych układach przecinałby zegar i napisy
export const hasBlock = (id: string, layout: string) => id === 'krem' && layout === 'edit'
export function cleanBackground(id: string, layout: string) {
  const c = CLEAN[id]
  g.fillStyle = c.bg; g.fillRect(0, 0, W, H)
  if (hasBlock(id, layout)) { g.fillStyle = c.ink; g.fillRect(1120, 0, 800, H) }
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
