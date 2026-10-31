// Czyste plansze: spokojne tło, elegancka typografia i cienka linia gór. Krem i Piasek — jednolity kolor; Czerń — rozmyte,
// czarno-białe zdjęcie skały pod żółtym napisem.
import { H, W } from './state'
import { fontStr, g, img, rounded, text } from './paint'

export const CLEAN: Record<string, { bg: string, ink: string, accent: string, line: string }> = {
  krem: { bg: '#fbf3e6', ink: '#1a2a9a', accent: '#1a2a9a', line: '#1a2a9a' },
  piasek: { bg: '#e2d9cd', ink: '#2c0f14', accent: '#e8525f', line: '#e8525f' },
  czern: { bg: '#0d0d0d', ink: '#f5e66c', accent: '#f5e66c', line: '#f5e66c' },
}
export const isClean = (id: string) => id in CLEAN
export const cleanInk = (id: string) => CLEAN[id] || CLEAN.krem

let dark: HTMLCanvasElement = null
export function cleanBackground(id: string) {
  const c = CLEAN[id]
  g.fillStyle = c.bg; g.fillRect(0, 0, W, H)
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
  const label = str.toUpperCase(), size = 26, h = 50
  g.save(); g.font = fontStr(700, size, 'sans'); const w = g.measureText(label).width + 44; g.restore()
  g.save(); g.lineWidth = 3; g.strokeStyle = ink; rounded(x, y, w, h, h / 2); g.stroke(); g.restore()
  text(label, x + 22, y + 35, { size, weight: 700, font: 'sans', color: ink })
  return w
}
