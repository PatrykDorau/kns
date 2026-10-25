// Tło całej aplikacji: góra z logo KNS z krzyżem narysowana „odręcznie” — jak szkic długopisem: każda linia lekko wygięta
// i drżąca, z drugim, przesuniętym pociągnięciem i wyjściem poza koniec (jak w podpisie); krzyż dwiema zamaszystymi kreskami.
// Bez kolorów i wypełnień; rysuje się powoli po wczytaniu (pathLength=1, stroke-dashoffset: 1 → 0). Leży pod treścią
// (#app ma z-index 1), nie przechwytuje kliknięć. Przy „ogranicz ruch” — od razu narysowana.
type P = [number, number]

// powtarzalny „los” — ten sam szkic przy każdym wczytaniu
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

// jedno pociągnięcie przez punkty: odcinki jako krzywe z lekkim wygięciem, drobne drżenie, wyjście poza oba końce
function stroke(pts: P[], wobble: number, over = 10): string {
  const j = (p: P, k = 1): P => [p[0] + rnd() * wobble * k, p[1] + rnd() * wobble * k]
  const a = pts[0], b = pts[1], y = pts[pts.length - 2], z = pts[pts.length - 1]
  const ext = (p: P, q: P, d: number): P => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [q[0] + (q[0] - p[0]) / l * d, q[1] + (q[1] - p[1]) / l * d] }
  const all = [ext(b, a, over * (0.4 + Math.abs(rnd()))), ...pts.slice(1, -1), ext(y, z, over * (0.6 + Math.abs(rnd())))]
  all.splice(1, 0, a)
  // dłuższe odcinki dzielone na kawałki — ręka nie prowadzi idealnie prostej linii
  for (let i = all.length - 1; i > 0; i--) {
    const p = all[i - 1], q = all[i], l = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.floor(l / 140)
    for (let m = k; m >= 1; m--) all.splice(i, 0, [p[0] + (q[0] - p[0]) * m / (k + 1), p[1] + (q[1] - p[1]) * m / (k + 1)])
  }
  let d = `M${j(all[0], 0.5).map(Math.round).join(' ')}`
  for (let i = 1; i < all.length; i++) {
    const p = all[i - 1], q = j(all[i]), l = Math.hypot(q[0] - p[0], q[1] - p[1])
    // punkt kontrolny: środek odcinka odsunięty w bok (łuk ręki)
    const nx = -(q[1] - p[1]) / (l || 1), ny = (q[0] - p[0]) / (l || 1), bow = rnd() * l * 0.11
    const c: P = [(p[0] + q[0]) / 2 + nx * bow, (p[1] + q[1]) / 2 + ny * bow]
    d += ` Q${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(q[0])} ${Math.round(q[1])}`
  }
  return d
}
// dwa pociągnięcia tej samej linii (drugie lżejsze i trochę obok) — szkicowy, „niedokończony” wygląd
const sketch = (pts: P[], wobble: number, cls: string) => [stroke(pts, wobble), stroke(pts, wobble * 1.6, 6)]
  .map((d, i) => `<path class="${cls}${i ? ' kb-2' : ''}" pathLength="1" d="${d}" />`).join('')

const RIDGE: P[] = [[440, 520], [800, 128], [950, 276], [1070, 216], [1430, 520]]
const FAR_L: P[] = [[-40, 520], [180, 300], [262, 382], [330, 330], [520, 520]]
const FAR_R: P[] = [[1080, 520], [1290, 280], [1372, 372], [1436, 320], [1660, 520]]

export function startBackdrop() {
  if (document.querySelector('.kns-backdrop')) return
  seed = 7
  const el = document.createElement('div')
  el.className = 'kns-backdrop'
  el.innerHTML = `<svg viewBox="0 0 1600 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    ${sketch(FAR_L, 5, 'kb-far')}${sketch(FAR_R, 5, 'kb-far')}
    ${sketch(RIDGE, 7, 'kb-ridge')}
    <path class="kb-cross" pathLength="1" d="${stroke([[802, 140], [799, 92], [796, 40]], 4, 16)} q-4 12 -14 18" />
    <path class="kb-cross kb-cross2" pathLength="1" d="M760 80 q14 -10 36 -9 t44 -8 q8 -2 10 6" />
  </svg>`
  document.body.prepend(el)
}
