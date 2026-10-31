// Ilustracja plansz: góra z krzyżem z tła aplikacji, namalowana — niebo ze słońcem, chmury, dalekie pasma we mgle, główny
// szczyt z fakturą prawdziwej skały i światłem z jednej strony, kamienie na pierwszym planie, ziarno. Malowana raz
// (po jednej na klimat), w klatce już tylko wstawiana; kreska i kurz idą na wierzchu (rough.ts).
import { H, W } from './state'
import { g, img } from './paint'
import { PEAK_X, PEAK_S } from './rough'

type P = [number, number]
export interface Mood { sky: [number, string][], sun: string, sunAt: P, cloud: string, far: string[], rock: [string, string], lit: string, fog: string, ground: string, rim: string, line: string, tint: string }
export const MOODS: Record<string, Mood> = {
  szczyt: { sky: [[0, '#5a2b14'], [0.42, '#b5642a'], [0.72, '#e8a659'], [1, '#f3cf94']], sun: 'rgba(255,226,165,0.95)', sunAt: [0.56, 0.42], cloud: 'rgba(255,214,160,0.34)', far: ['#c98a52', '#a9683a', '#7f4726'], rock: ['#3a2114', '#1c0f08'], lit: 'rgba(240,160,90,0.62)', fog: 'rgba(246,206,150,0.5)', ground: '#160b06', rim: 'rgba(255,190,120,0.55)', line: '#fff0d8', tint: 'rgba(214,120,50,0.34)' },
  swit: { sky: [[0, '#3b3158'], [0.38, '#8f5478'], [0.68, '#e58f7c'], [1, '#fbd3a2']], sun: 'rgba(255,236,196,0.98)', sunAt: [0.52, 0.5], cloud: 'rgba(255,205,190,0.38)', far: ['#b87f8e', '#8c5a78', '#5f3e60'], rock: ['#3a2740', '#1b1224'], lit: 'rgba(255,170,130,0.6)', fog: 'rgba(255,214,190,0.5)', ground: '#120c1a', rim: 'rgba(255,190,160,0.55)', line: '#ffeee0', tint: 'rgba(230,120,120,0.28)' },
  noc: { sky: [[0, '#070b1c'], [0.45, '#121d3e'], [0.78, '#27365f'], [1, '#54597e']], sun: 'rgba(255,222,150,0.8)', sunAt: [0.54, 0.26], cloud: 'rgba(120,150,210,0.22)', far: ['#34436e', '#26335a', '#1a2444'], rock: ['#1b2340', '#0a0e20'], lit: 'rgba(120,160,230,0.42)', fog: 'rgba(130,155,215,0.3)', ground: '#060914', rim: 'rgba(245,190,100,0.5)', line: '#e4ecff', tint: 'rgba(70,100,190,0.3)' },
  zar: { sky: [[0, '#1d0a0c'], [0.4, '#6e1a14'], [0.7, '#d4501c'], [1, '#f8a93d']], sun: 'rgba(255,212,120,0.98)', sunAt: [0.58, 0.54], cloud: 'rgba(255,130,70,0.3)', far: ['#a53c1c', '#7a2616', '#4e1610'], rock: ['#2c100c', '#120605'], lit: 'rgba(255,120,50,0.62)', fog: 'rgba(250,140,70,0.42)', ground: '#0c0403', rim: 'rgba(255,150,70,0.6)', line: '#ffe6c8', tint: 'rgba(210,70,20,0.32)' },
}
export const isMood = (id: string) => id in MOODS

const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647
// poszarpana krawędź skały (jak w tle aplikacji)
function jag(pts: P[], r: () => number, rough = 0.16, depth = 4): P[] {
  let out = pts
  for (let k = 0; k < depth; k++) {
    const next: P[] = [out[0]]
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), off = (r() * 2 - 1) * l * rough
      next.push([(a[0] + b[0]) / 2 - (b[1] - a[1]) / (l || 1) * off, (a[1] + b[1]) / 2 + (b[0] - a[0]) / (l || 1) * off], b)
    }
    out = next
  }
  return out
}
const X = (x: number) => PEAK_X + (x - 700) * PEAK_S, Y = (y: number) => H + (y - 1000) * PEAK_S
const trace = (p: CanvasRenderingContext2D, pts: P[]) => { p.beginPath(); pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y)))) }
// szkielet: te same punkty co rysunek kreską, żeby farba leżała pod liniami
const TOP: P = [700, 304]
const LEFT: P[] = [TOP, [664, 368], [622, 438], [578, 496], [532, 575], [482, 632], [420, 700], [362, 770], [300, 820], [180, 1100]]
const RIGHT: P[] = [TOP, [742, 366], [779, 436], [806, 482], [846, 486], [884, 545], [918, 600], [956, 652], [998, 684], [1045, 728], [1098, 792], [1160, 836], [1300, 1100]]
const SPINE: P[] = [TOP, [708, 360], [694, 418], [668, 468], [640, 538], [604, 612], [566, 690], [526, 770], [490, 1100]]
const SIDES: P[][] = [
  [[-560, 1100], [-430, 820], [-320, 736], [-210, 668], [-120, 606], [-80, 582], [-30, 620], [40, 676], [120, 724], [200, 772], [290, 830], [420, 1100]],
  [[1010, 1100], [1110, 840], [1220, 774], [1330, 700], [1420, 632], [1490, 588], [1540, 626], [1610, 676], [1700, 730], [1800, 800], [1960, 1100]],
  [[120, 1100], [184, 652], [232, 612], [272, 572], [312, 535], [346, 580], [384, 612], [430, 642], [520, 1100]],
  [[900, 1100], [960, 646], [996, 628], [1040, 598], [1076, 566], [1108, 525], [1140, 574], [1184, 622], [1228, 662], [1320, 1100]],
]
function ridge(p: CanvasRenderingContext2D, r: () => number, base: number, amp: number, color: string) {
  const pts: P[] = [[-40, H + 20]]
  for (let x = -40; x <= W + 120; x += 110) pts.push([x, base - r() * amp])
  pts.push([W + 120, H + 20])
  const edge = jag(pts.slice(1, -1), r, 0.12, 3)
  p.beginPath(); p.moveTo(-40, H + 20); edge.forEach(([x, y]) => p.lineTo(x, y)); p.lineTo(W + 120, H + 20); p.closePath()
  p.fillStyle = color; p.fill()
}
function paint(m: Mood, stone: CanvasImageSource | null) {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const p = c.getContext('2d'), r = seeded(23)
  // niebo i słońce
  const sky = p.createLinearGradient(0, 0, 0, H * 0.82)
  m.sky.forEach(([at, col]) => sky.addColorStop(at, col))
  p.fillStyle = sky; p.fillRect(0, 0, W, H)
  const sx = W * m.sunAt[0], sy = H * m.sunAt[1], sun = p.createRadialGradient(sx, sy, 0, sx, sy, 760)
  sun.addColorStop(0, m.sun); sun.addColorStop(0.1, m.sun.replace(/[\d.]+\)$/, '0.62)')); sun.addColorStop(0.42, m.sun.replace(/[\d.]+\)$/, '0.16)')); sun.addColorStop(1, m.sun.replace(/[\d.]+\)$/, '0)'))
  p.fillStyle = sun; p.fillRect(0, 0, W, H)
  // promienie zza szczytu
  p.save(); p.globalCompositeOperation = 'screen'; p.translate(sx, sy)
  for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, w = 0.02 + r() * 0.05, l = 900 + r() * 700, gr = p.createRadialGradient(0, 0, 40, 0, 0, l); gr.addColorStop(0, m.sun.replace(/[\d.]+\)$/, '0.14)')); gr.addColorStop(1, m.sun.replace(/[\d.]+\)$/, '0)')); p.fillStyle = gr; p.beginPath(); p.moveTo(0, 0); p.arc(0, 0, l, a, a + w); p.closePath(); p.fill() }
  p.restore()
  // chmury: długie, miękkie smugi
  p.save(); p.filter = 'blur(22px)'; p.fillStyle = m.cloud
  for (let i = 0; i < 26; i++) { p.globalAlpha = 0.35 + r() * 0.65; p.beginPath(); p.ellipse(r() * W, H * (0.08 + r() * 0.42), 180 + r() * 420, 8 + r() * 26, (r() - 0.5) * 0.08, 0, Math.PI * 2); p.fill() }
  p.restore()
  // dalekie pasma, coraz bliżej i ciemniej
  ridge(p, r, H * 0.64, 120, m.far[0]); ridge(p, r, H * 0.72, 130, m.far[1])
  p.save(); p.filter = 'blur(26px)'; p.fillStyle = m.fog; p.fillRect(-60, H * 0.66, W + 120, 70); p.restore()
  ridge(p, r, H * 0.8, 120, m.far[2])
  // boczne szczyty
  for (const s of SIDES) {
    const pts = jag(s, r, 0.13)
    trace(p, pts); p.closePath()
    const gr = p.createLinearGradient(0, Y(520), 0, H); gr.addColorStop(0, m.rock[0]); gr.addColorStop(1, m.rock[1])
    p.fillStyle = gr; p.fill()
  }
  p.save(); p.filter = 'blur(30px)'; p.fillStyle = m.fog; p.globalAlpha = 0.7; p.fillRect(-60, H * 0.8, W + 120, 60); p.restore()
  // główny szczyt: cień, oświetlone zbocze i faktura skały
  const left = jag(LEFT, r), right = jag(RIGHT, r), spine = jag(SPINE, r, 0.1)
  const whole: P[] = [...left.slice().reverse(), ...right.slice(1)]
  p.save(); trace(p, whole); p.closePath(); p.clip()
  const rock = p.createLinearGradient(0, Y(300), 0, H); rock.addColorStop(0, m.rock[0]); rock.addColorStop(1, m.rock[1])
  p.fillStyle = rock; p.fillRect(0, 0, W, H)
  if (stone) {
    p.globalCompositeOperation = 'overlay'; p.globalAlpha = 0.85
    p.drawImage(stone, 860, 300, 900, 760, X(120), Y(280), 1160 * PEAK_S, 860 * PEAK_S)
    p.globalCompositeOperation = 'soft-light'; p.globalAlpha = 1
    p.drawImage(stone, 860, 300, 900, 760, X(120), Y(280), 1160 * PEAK_S, 860 * PEAK_S)
    p.globalCompositeOperation = 'source-over'; p.globalAlpha = 1
  }
  // słońce z lewej: jasne zbocze od grzbietu w lewo, cień w prawo
  const lit = p.createLinearGradient(X(420), 0, X(700), 0); lit.addColorStop(0, m.lit); lit.addColorStop(1, m.lit.replace(/[\d.]+\)$/, '0.05)'))
  trace(p, [...spine, ...left.slice().reverse()]); p.closePath(); p.fillStyle = lit; p.fill()
  p.restore()
  // światło na krawędzi skały
  p.save(); p.strokeStyle = m.rim; p.lineWidth = 3.5; p.lineJoin = 'round'; trace(p, left); p.stroke(); p.restore()
  // mgła u podnóża
  p.save(); p.filter = 'blur(38px)'; p.fillStyle = m.fog
  for (let i = 0; i < 12; i++) { p.globalAlpha = 0.28 + r() * 0.4; p.beginPath(); p.ellipse(r() * W, H * (0.84 + r() * 0.08), 280 + r() * 380, 26 + r() * 40, 0, 0, Math.PI * 2); p.fill() }
  p.restore()
  // kamienie na pierwszym planie
  for (const [x0, x1, top] of [[-60, 640, 0.88], [1320, W + 60, 0.9], [420, 1280, 0.96]] as [number, number, number][]) {
    const peak = x0 + (x1 - x0) * (0.3 + r() * 0.4), edge = jag([[x0, H + 20], [x0 + (peak - x0) * 0.4, H * (top + 0.05)], [peak, H * top], [peak + (x1 - peak) * 0.5, H * (top + 0.05)], [x1, H + 20]], r, 0.12, 4)
    p.beginPath(); edge.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); p.fillStyle = m.ground; p.fill()
    p.strokeStyle = m.rim; p.lineWidth = 2; p.globalAlpha = 0.5; p.stroke(); p.globalAlpha = 1
  }
  // winieta i ziarno
  const v = p.createRadialGradient(W * 0.55, H * 0.45, H * 0.45, W * 0.55, H * 0.45, W * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.62)')
  p.fillStyle = v; p.fillRect(0, 0, W, H)
  const n = document.createElement('canvas'); n.width = n.height = 256
  const nc = n.getContext('2d'), d = nc.createImageData(256, 256)
  for (let i = 0; i < d.data.length; i += 4) { const k = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = k; d.data[i + 3] = 22 }
  nc.putImageData(d, 0, 0)
  p.globalCompositeOperation = 'overlay'; p.fillStyle = p.createPattern(n, 'repeat'); p.fillRect(0, 0, W, H)
  return c
}
const done = new Map<string, HTMLCanvasElement>()
// Ilustracja klimatu; zanim wczyta się faktura skały — bez niej, potem malowana od nowa.
export function drawPeak(id: string) {
  const stone = img('./tla/kamien.jpg'), key = id + (stone ? ':s' : '')
  let c = done.get(key)
  if (!c) { c = paint(MOODS[id], stone); done.set(key, c) }
  g.drawImage(c, 0, 0, W, H)
}
