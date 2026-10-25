// Tło całej aplikacji: szczegółowy szkic góry z krzyżem na szczycie (jak ilustracja KNS) — poszarpany główny szczyt
// z grzbietami i kreskowaniem skał, niższe szczyty po bokach i dalekie pasma; sama kreska, bez kolorów.
// Krawędzie skał powstają fraktalnie (powtarzalny „los” — zawsze ten sam rysunek), kreskowanie po zacienionej stronie
// grzbietów. Rysuje się po kolei po wczytaniu (pathLength=1, stroke-dashoffset 1 → 0), krzyż na końcu z lekką poświatą.
// Leży pod treścią (#app ma z-index 1), nie przechwytuje kliknięć. Przy „ogranicz ruch” — od razu gotowy.
type P = [number, number]

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
const r2 = (p: P): string => `${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`

// poszarpana krawędź skały: podział odcinków w pół z przesunięciem w bok (coraz mniejszym)
function jag(pts: P[], rough = 0.16, depth = 4): P[] {
  let out = pts
  for (let k = 0; k < depth; k++) {
    const next: P[] = [out[0]]
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], l = Math.hypot(b[0] - a[0], b[1] - a[1])
      const off = rnd() * l * rough
      next.push([(a[0] + b[0]) / 2 - (b[1] - a[1]) / (l || 1) * off, (a[1] + b[1]) / 2 + (b[0] - a[0]) / (l || 1) * off], b)
    }
    out = next
  }
  return out
}
const line = (pts: P[]) => 'M' + pts.map(r2).join(' L')
// punkt na łamanej w ułamku t długości i kierunek w tym miejscu
function along(pts: P[], t: number): { p: P, d: P } {
  const segs = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]))
  let want = segs.reduce((a, b) => a + b, 0) * t
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const a = pts[i], b = pts[i + 1], k = segs[i] ? Math.min(1, want / segs[i]) : 0
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], d: [(b[0] - a[0]) / (segs[i] || 1), (b[1] - a[1]) / (segs[i] || 1)] }
    }
    want -= segs[i]
  }
  return { p: pts[0], d: [1, 0] }
}
// kreskowanie: krótkie, lekko łamane kreski spływające ze skały w stronę „dir” (cień), gęstość — co ile px
function hatch(ridge: P[], dir: P, len: [number, number], every = 14, from = 0, to = 1): string {
  const total = ridge.slice(1).reduce((s, b, i) => s + Math.hypot(b[0] - ridge[i][0], b[1] - ridge[i][1]), 0)
  const n = Math.max(2, Math.round(total * (to - from) / every))
  let d = ''
  for (let i = 0; i < n; i++) {
    const { p } = along(ridge, from + (to - from) * (i + 0.5 + rnd() * 0.3) / n)
    const L = len[0] + Math.abs(rnd()) * (len[1] - len[0])
    const a: P = [p[0] + rnd() * 2, p[1] + rnd() * 2]
    const m: P = [a[0] + dir[0] * L * 0.5 + rnd() * 3, a[1] + dir[1] * L * 0.5 + rnd() * 3]
    const b: P = [a[0] + dir[0] * L + rnd() * 4, a[1] + dir[1] * L + rnd() * 4]
    d += ` M${r2(a)} L${r2(m)} L${r2(b)}`
  }
  return d
}
// szkielet rysunku (viewBox 0 0 1400 1000, szczyt z krzyżem w 700,300)
const TOP: P = [700, 304]
const LEFT: P[] = [TOP, [664, 368], [622, 438], [578, 496], [532, 575], [482, 632], [420, 700], [362, 770], [300, 820]]
const RIGHT: P[] = [TOP, [742, 366], [779, 436], [806, 482], [846, 486], [884, 545], [918, 600], [956, 652], [998, 684], [1045, 728], [1098, 792], [1160, 836]]
const SPINE: P[] = [[703, 312], [708, 360], [694, 418], [668, 468], [640, 538]]                 // grzbiet od szczytu w dół
const SHOULDER: P[] = [[640, 538], [682, 566], [730, 606], [770, 650], [818, 690], [872, 728], [940, 782], [1010, 818]] // ramię w prawo
const SPUR: P[] = [[640, 538], [604, 612], [566, 690], [526, 770], [490, 830]]                  // żebro w lewo w dół
const RIB_R: P[] = [[716, 340], [748, 412], [780, 476], [800, 532], [828, 572]]                 // żebro na prawym zboczu
const RIB_R2: P[] = [[806, 482], [830, 540], [850, 600], [884, 650]]
const RIB_L: P[] = [[664, 368], [648, 420], [626, 470], [606, 520]]
const FRONT_L: P[] = [[770, 652], [722, 712], [672, 770], [616, 838], [580, 880]]               // niższy szczyt z przodu
const FRONT_R: P[] = [[770, 652], [812, 690], [866, 738], [932, 794], [990, 830]]
const SIDE_L1: P[] = [[312, 535], [272, 572], [232, 612], [184, 652], [112, 684], [40, 700]]
const SIDE_L2: P[] = [[312, 535], [346, 580], [384, 612], [430, 642], [470, 660]]
const SIDE_L3: P[] = [[312, 535], [318, 572], [306, 612], [290, 650]]
const SIDE_R1: P[] = [[1108, 525], [1076, 566], [1040, 598], [996, 628], [960, 646]]
const SIDE_R2: P[] = [[1108, 525], [1140, 574], [1184, 622], [1228, 662], [1282, 700], [1360, 724]]
const SIDE_R3: P[] = [[1108, 525], [1104, 566], [1116, 604], [1110, 640]]
const FAR_L: P[] = [[-560, 600], [-500, 572], [-452, 590], [-420, 560], [-300, 600], [-240, 576], [-176, 612], [-120, 590], [0, 640], [70, 600], [120, 612], [176, 560], [214, 590], [250, 548]]
const FAR_R: P[] = [[1160, 560], [1200, 590], [1250, 552], [1300, 600], [1350, 584], [1400, 620], [1440, 596], [1580, 610], [1640, 576], [1700, 600], [1740, 560], [1860, 600], [1960, 580]]
// skrajne szczyty — rysunek na całą szerokość (po lewej wychodzi spod bocznego menu)
const OUT_L1: P[] = [[-560, 900], [-430, 820], [-320, 736], [-210, 668], [-120, 606], [-80, 582], [-30, 620], [40, 676], [120, 724], [200, 772], [290, 830], [380, 900]]
const OUT_L1R: P[] = [[-80, 582], [-90, 640], [-120, 700], [-150, 760], [-190, 830]]
const OUT_L2: P[] = [[-560, 690], [-500, 640], [-440, 572], [-390, 530], [-340, 574], [-290, 610], [-226, 664]]
const OUT_L2R: P[] = [[-390, 530], [-382, 576], [-396, 624]]
const OUT_R1: P[] = [[1010, 900], [1110, 840], [1220, 774], [1330, 700], [1420, 632], [1490, 588], [1540, 626], [1610, 676], [1700, 730], [1800, 800], [1960, 880]]
const OUT_R1R: P[] = [[1490, 588], [1500, 644], [1488, 706], [1470, 780], [1440, 860]]
const OUT_R2: P[] = [[1620, 700], [1690, 630], [1750, 566], [1800, 522], [1846, 560], [1900, 604], [1960, 640]]
const OUT_R2R: P[] = [[1800, 522], [1810, 572], [1796, 620]]
const FAR_M_L: P[] = [[390, 520], [430, 488], [468, 508], [506, 474], [546, 500]]
const FAR_M_R: P[] = [[820, 470], [862, 446], [900, 476], [940, 452], [988, 492], [1030, 470], [1066, 500]]

// speed < 1 — szybciej (strona gościa rysuje górę od nowa jako ekran wczytywania); zwraca czas rysowania w ms
export function startBackdrop(speed = 1): number {
  if (document.querySelector('.kns-backdrop')) return 0
  seed = 11
  const P = (d: string, cls: string, delay: number, dur: number) => `<path class="${cls}" pathLength="1" style="animation-delay:${+(delay * speed).toFixed(2)}s;animation-duration:${+(dur * speed).toFixed(2)}s" d="${d}" />`
  const edge = (pts: P[], delay: number, dur: number, cls = 'kb-edge', rough = 0.16) => P(line(jag(pts, rough)), cls, delay, dur) + P(line(jag(pts, rough * 1.3)), cls + ' kb-2', delay + 0.4, dur)
  const parts = [
    // dalekie pasma w tle
    P(line(jag(FAR_L, 0.2, 3)), 'kb-far', 0.2, 2.6), P(line(jag(FAR_R, 0.2, 3)), 'kb-far', 0.3, 2.6),
    P(line(jag(FAR_M_L, 0.2, 3)), 'kb-far', 0.6, 2), P(line(jag(FAR_M_R, 0.2, 3)), 'kb-far', 0.7, 2.2),
    // główny szczyt — zarys, grzbiety i żebra
    edge(LEFT, 0.4, 3), edge(RIGHT, 0.5, 3.2),
    edge(SPINE, 1.4, 1.4, 'kb-ridge'), edge(SHOULDER, 2, 2.2, 'kb-ridge'), edge(SPUR, 2.3, 1.8, 'kb-ridge'),
    edge(RIB_R, 1.8, 1.6, 'kb-rib'), edge(RIB_R2, 2.4, 1.2, 'kb-rib'), edge(RIB_L, 2, 1.2, 'kb-rib'),
    edge(FRONT_L, 2.8, 1.6, 'kb-ridge'), edge(FRONT_R, 3, 1.6, 'kb-ridge'),
    // kreskowanie skał (cień po prawej stronie grzbietów, spękania w dół zboczy)
    P(hatch(SPINE, [0.55, 0.83], [18, 46], 9), 'kb-hatch', 3.2, 2.4),
    P(hatch(RIGHT, [-0.42, 0.9], [14, 40], 11, 0.05, 0.6), 'kb-hatch', 3.4, 2.6),
    P(hatch(SHOULDER, [0.22, 0.97], [16, 52], 10), 'kb-hatch', 3.6, 2.6),
    P(hatch(RIB_R, [0.5, 0.86], [12, 34], 10), 'kb-hatch', 3.8, 2),
    P(hatch(LEFT, [0.55, 0.83], [10, 30], 16, 0.1, 0.9), 'kb-hatch kb-light', 3.6, 2.6),
    P(hatch(SPUR, [0.75, 0.66], [14, 38], 12), 'kb-hatch', 4, 2),
    P(hatch(FRONT_R, [-0.2, 0.98], [12, 34], 11), 'kb-hatch', 4.2, 2),
    // skrajne szczyty
    edge(OUT_L1, 1, 3, 'kb-side'), edge(OUT_L1R, 2.6, 1.2, 'kb-rib'), edge(OUT_L2, 1.4, 2, 'kb-side kb-back'), edge(OUT_L2R, 2.8, 0.8, 'kb-rib kb-back'),
    edge(OUT_R1, 1, 3, 'kb-side'), edge(OUT_R1R, 2.6, 1.2, 'kb-rib'), edge(OUT_R2, 1.4, 2, 'kb-side kb-back'), edge(OUT_R2R, 2.8, 0.8, 'kb-rib kb-back'),
    P(hatch(OUT_L1R, [0.55, 0.83], [12, 34], 10), 'kb-hatch kb-light', 4, 1.6),
    P(hatch(OUT_L1, [-0.3, 0.95], [10, 30], 14, 0.45, 0.85), 'kb-hatch kb-light', 4.1, 2),
    P(hatch(OUT_R1R, [0.55, 0.83], [12, 34], 10), 'kb-hatch kb-light', 4, 1.6),
    P(hatch(OUT_R1, [-0.3, 0.95], [10, 30], 14, 0.5, 0.85), 'kb-hatch kb-light', 4.1, 2),
    P(hatch(OUT_L2R, [0.6, 0.8], [8, 22], 9), 'kb-hatch kb-light kb-back', 4.3, 1.2),
    P(hatch(OUT_R2R, [0.6, 0.8], [8, 22], 9), 'kb-hatch kb-light kb-back', 4.3, 1.2),
    // boczne szczyty z kreskowaniem
    edge(SIDE_L1, 2.6, 2, 'kb-side'), edge(SIDE_L2, 2.8, 1.6, 'kb-side'), edge(SIDE_L3, 3.2, 0.9, 'kb-rib'),
    edge(SIDE_R1, 2.8, 1.8, 'kb-side'), edge(SIDE_R2, 3, 2, 'kb-side'), edge(SIDE_R3, 3.4, 0.9, 'kb-rib'),
    P(hatch(SIDE_L3, [0.6, 0.8], [10, 26], 9), 'kb-hatch kb-light', 4.2, 1.4),
    P(hatch(SIDE_L2, [-0.1, 1], [10, 28], 13), 'kb-hatch kb-light', 4.3, 1.6),
    P(hatch(SIDE_R3, [0.6, 0.8], [10, 26], 9), 'kb-hatch kb-light', 4.4, 1.4),
    P(hatch(SIDE_R2, [-0.2, 0.98], [10, 30], 13), 'kb-hatch kb-light', 4.5, 1.8),
  ]
  // krzyż: dwie pewne kreski z poświatą
  const cross = `<g class="kb-cross-g">${P(line(jag([[700, 302], [700, 196]], 0.01, 2)), 'kb-cross', 5.6, 0.6)}${P(line(jag([[672, 228], [728, 228]], 0.01, 2)), 'kb-cross', 6.1, 0.4)}</g>`
  const el = document.createElement('div')
  el.className = 'kns-backdrop'
  el.innerHTML = `<svg viewBox="-560 160 2520 840" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${parts.join('')}${cross}</svg>`
  document.body.prepend(el)
  return 6500 * speed
}
export function redrawBackdrop(speed = 1): number {
  document.querySelector('.kns-backdrop')?.remove()
  return startBackdrop(speed)
}
