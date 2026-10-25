// Tło całej aplikacji: szkic góry z krzyżem na szczycie (jak ilustracja KNS) — poszarpany główny szczyt z grzbietami,
// niższe szczyty po bokach i smugi mgły; sama kreska, bez kolorów i wypełnień. Rysuje się odręcznie po wczytaniu:
// każda linia lekko drży (powtarzalny „los”), kolejne kreski dochodzą po kolei (pathLength=1, stroke-dashoffset 1 → 0),
// krzyż na końcu. Leży pod treścią (#app ma z-index 1), nie przechwytuje kliknięć. Przy „ogranicz ruch” — od razu gotowa.
type P = [number, number]

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

// pociągnięcie przez punkty: krótkie krzywe z drżeniem (jak kreska piórkiem)
function stroke(pts: P[], wobble = 2.5): string {
  const j = (p: P): P => [p[0] + rnd() * wobble, p[1] + rnd() * wobble]
  let prev = j(pts[0]), d = `M${prev.map(Math.round).join(' ')}`
  for (let i = 1; i < pts.length; i++) {
    const q = j(pts[i]), l = Math.hypot(q[0] - prev[0], q[1] - prev[1]) || 1
    const bow = rnd() * l * 0.08, c: P = [(prev[0] + q[0]) / 2 - (q[1] - prev[1]) / l * bow, (prev[1] + q[1]) / 2 + (q[0] - prev[0]) / l * bow]
    d += ` Q${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(q[0])} ${Math.round(q[1])}`
    prev = q
  }
  return d
}
// smuga mgły: falista linia z punktu x0 do x1 na wysokości y
function mist(x0: number, x1: number, y: number, amp = 11): string {
  let d = `M${x0} ${y}`, x = x0, up = rnd() > 0
  while (x < x1) {
    const step = 40 + Math.abs(rnd()) * 50, nx = Math.min(x1, x + step), dy = (up ? -1 : 1) * amp * (0.4 + Math.abs(rnd()))
    d += ` Q${Math.round(x + step / 2)} ${Math.round(y + dy)} ${Math.round(nx)} ${Math.round(y + rnd() * 3)}`
    x = nx; up = !up
  }
  return d
}

// [punkty, grubość, opóźnienie (s), czas (s)]
const LINES: [P[], number, number, number][] = [
  // główny szczyt — zbocza
  [[[700, 305], [688, 322], [680, 345], [664, 368], [655, 392], [636, 410], [622, 438], [605, 452], [596, 478], [578, 496], [565, 525], [545, 545], [532, 575], [515, 595], [498, 610], [482, 632], [462, 648], [448, 672], [420, 700], [395, 735], [362, 770], [330, 800]], 1.6, 0.4, 3.2],
  [[[700, 305], [714, 322], [726, 348], [742, 366], [752, 392], [770, 408], [779, 436], [792, 452], [806, 482], [826, 478], [846, 486], [868, 512], [884, 545], [902, 572], [918, 600], [938, 622], [956, 652], [976, 676], [998, 684], [1020, 700], [1045, 728], [1072, 760], [1098, 792], [1130, 820]], 1.6, 0.6, 3.2],
  // grzbiety na zboczach (światło na krawędziach)
  [[[703, 312], [710, 345], [706, 382], [694, 418], [680, 446], [668, 468]], 1.2, 1.6, 1.6],
  [[[668, 468], [652, 500], [640, 538], [656, 552], [682, 566], [706, 584], [730, 606], [752, 624], [770, 650], [792, 672], [818, 690], [846, 702], [872, 728], [904, 756], [940, 782]], 1.2, 2.2, 2.4],
  [[[640, 538], [622, 572], [604, 612], [588, 648], [566, 690], [548, 728], [526, 770], [500, 810]], 1.1, 2.6, 2],
  [[[716, 340], [736, 378], [748, 412], [764, 446], [780, 476], [792, 500], [800, 532], [818, 560]], 1, 2.4, 1.6],
  // niższy szczyt z przodu
  [[[770, 652], [748, 680], [722, 712], [700, 742], [672, 770], [646, 804], [616, 838]], 1.2, 3, 1.6],
  [[[770, 652], [790, 676], [812, 690], [838, 708], [866, 738], [896, 768], [932, 794], [972, 812]], 1.2, 3.2, 1.6],
  // szczyt po lewej
  [[[312, 535], [296, 556], [272, 572], [254, 596], [232, 612], [210, 636], [184, 652], [150, 668], [112, 684], [70, 694]], 1, 2.8, 2],
  [[[312, 535], [330, 556], [346, 580], [366, 592], [384, 612], [404, 628], [430, 642], [452, 656]], 1, 3, 1.6],
  // szczyt po prawej
  [[[1108, 525], [1094, 546], [1076, 566], [1060, 584], [1040, 598], [1018, 612], [996, 628], [972, 642]], 1, 3, 1.8],
  [[[1108, 525], [1124, 550], [1140, 574], [1162, 598], [1184, 622], [1204, 640], [1228, 662], [1252, 680], [1282, 700], [1320, 716]], 1, 3.2, 2],
]
// smugi mgły [x0, x1, y, opóźnienie]
const MISTS: [number, number, number, number][] = [
  [90, 300, 712, 3.6], [1240, 1380, 728, 3.8], [180, 470, 790, 4], [1000, 1330, 800, 4.1], [330, 700, 868, 4.3],
  [760, 1200, 860, 4.4], [60, 380, 860, 4.6], [480, 960, 930, 4.7], [960, 1340, 920, 4.8], [200, 560, 940, 5],
]

export function startBackdrop() {
  if (document.querySelector('.kns-backdrop')) return
  seed = 11
  const path = (d: string, w: number, delay: number, dur: number, cls = '') =>
    `<path class="${cls}" pathLength="1" style="stroke-width:${w};animation-delay:${delay}s;animation-duration:${dur}s" d="${d}" />`
  const lines = LINES.map(([pts, w, delay, dur]) => path(stroke(pts), w, delay, dur) + path(stroke(pts, 4), w * 0.6, delay + 0.5, dur, 'kb-2')).join('')
  const mists = MISTS.map(([a, b, y, delay]) => path(mist(a, b, y), 0.9, delay, 2.4, 'kb-mist')).join('')
  const cross = path(stroke([[700, 302], [699, 250], [700, 196]], 1), 2, 5.2, 0.5, 'kb-cross') + path(stroke([[674, 228], [700, 227], [728, 229]], 1), 2, 5.6, 0.4, 'kb-cross')
  const el = document.createElement('div')
  el.className = 'kns-backdrop'
  el.innerHTML = `<svg viewBox="40 170 1320 790" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${mists}${lines}${cross}</svg>`
  document.body.prepend(el)
}
