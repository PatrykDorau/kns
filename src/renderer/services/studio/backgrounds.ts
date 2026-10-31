// Tła plansz (Odliczanie, Koniec): rysowane na płótnie w kolorach kościoła — stałe części liczone raz,
// ruch (mgła w górach) — w każdej klatce, powoli, żeby nie rozpraszał.
import { H, W } from './state'
import { g } from './paint'

const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647
const cache = new Map<string, HTMLCanvasElement>()
function once(id: string, draw: (p: CanvasRenderingContext2D) => void) {
  let c = cache.get(id)
  if (!c) { c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d')); cache.set(id, c) }
  g.drawImage(c, 0, 0)
}
// pasmo gór: od lewej do prawej, losowe (ale zawsze te same) szczyty
function ridge(p: CanvasRenderingContext2D, base: number, amp: number, step: number, seed: number, color: string) {
  const rnd = seeded(seed)
  p.beginPath(); p.moveTo(0, H)
  let y = base - rnd() * amp
  for (let x = 0; x <= W + step; x += step) { p.lineTo(x, y); y = base - rnd() * amp }
  p.lineTo(W, H); p.closePath(); p.fillStyle = color; p.fill()
}

// Góry o zmierzchu: niebo od granatu do pomarańczu, słońce nad horyzontem, cztery pasma gór; mgła płynie.
function mountains(t: number) {
  once('mountains', p => {
    const sky = p.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#16192b'); sky.addColorStop(0.45, '#3a2f4a'); sky.addColorStop(0.72, '#c86a3a'); sky.addColorStop(0.85, '#f2a541')
    p.fillStyle = sky; p.fillRect(0, 0, W, H)
    const rnd = seeded(11)
    for (let i = 0; i < 90; i++) { p.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`; p.fillRect(rnd() * W, rnd() * H * 0.4, 2, 2) }
    const sun = p.createRadialGradient(W * 0.62, H * 0.66, 0, W * 0.62, H * 0.66, 520)
    sun.addColorStop(0, 'rgba(255,214,140,0.95)'); sun.addColorStop(0.12, 'rgba(255,190,100,0.8)'); sun.addColorStop(1, 'rgba(255,170,80,0)')
    p.fillStyle = sun; p.fillRect(0, 0, W, H)
    ridge(p, 720, 170, 120, 3, '#8a4a4a')
    ridge(p, 800, 160, 95, 5, '#5b3443')
    ridge(p, 880, 150, 80, 9, '#36243a')
    ridge(p, 980, 110, 70, 17, '#1c1524')
  })
  // mgła między pasmami
  g.save(); g.globalAlpha = 0.18
  for (let k = 0; k < 2; k++) {
    const x = ((t / (60 + k * 30)) % (W * 2)) - W
    const gr = g.createLinearGradient(0, 760 + k * 90, 0, 900 + k * 90); gr.addColorStop(0, 'rgba(255,230,210,0)'); gr.addColorStop(0.5, 'rgba(255,230,210,1)'); gr.addColorStop(1, 'rgba(255,230,210,0)')
    g.fillStyle = gr; g.fillRect(x, 760 + k * 90, W * 2, 140)
  }
  g.restore()
}

// Szkic: jasne tło z kreską gór jak w logo — spokojne, jasne (ciemny tekst).
function sketch() {
  once('sketch', p => {
    const gr = p.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#fbf6ee'); gr.addColorStop(1, '#efe4d3')
    p.fillStyle = gr; p.fillRect(0, 0, W, H)
    p.lineJoin = 'round'; p.lineCap = 'round'
    const line = (pts: number[][], w: number, c: string) => { p.beginPath(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.lineWidth = w; p.strokeStyle = c; p.stroke() }
    line([[-20, 980], [260, 760], [420, 880], [700, 600], [960, 900], [1180, 700], [1420, 920], [1660, 640], [1940, 960]], 10, 'rgba(43,43,43,0.16)')
    line([[-20, 1040], [340, 860], [560, 960], [860, 760], [1120, 980], [1400, 820], [1700, 1000], [1940, 880]], 16, 'rgba(43,43,43,0.85)')
    p.fillStyle = 'rgba(43,43,43,0.12)'
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { p.beginPath(); p.arc(120 + k * 40, 120 + r * 40, 6, 0, Math.PI * 2); p.fill() }
  })
}

export const BACKGROUNDS = { mountains, sketch }
export const BG_IDS = ['szczyt', 'swit', 'noc', 'zar', 'krem', 'piasek', 'czern', 'paper', 'sketch', 'mountains', 'colors', 'image', 'camera']
export const LIGHT_BG = ['paper', 'sketch', 'krem', 'piasek'] // jasne tła — tekst na nich ciemny
