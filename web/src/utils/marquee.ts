// Długie tytuły (wydarzenia, ogłoszenia, nabożeństwa na listach): zamiast „…” tekst powoli przesuwa się w pętli
// — w lewo do końca, chwila przerwy, z powrotem. Działa samo dla elementów z listy TITLES, które się nie mieszczą.
const TITLES = [
  '.ev .body b', '.card .title', '.le-title', '.week-title', '.kh-ann-text b', '.kh-ann-t', '.hw-row-text b',
  'header h1', '.vote-ev-list button b', '.inbox-item b', '.ann b', '.bug-head b',
].join(', ')
const SPEED = 35 // px na sekundę

const seen = new WeakMap<HTMLElement, string>() // tekst i szerokość z ostatniego pomiaru — bez zmian nic nie ruszamy (animacja trwa)
function update(el: HTMLElement) {
  const key = el.textContent + '|' + el.clientWidth
  if (seen.get(el) === key) return
  seen.set(el, key)
  el.classList.remove('mq')
  const shift = el.scrollWidth - el.clientWidth
  if (shift <= 2 || !el.clientWidth) return
  el.style.setProperty('--mq', -shift + 'px')
  el.style.setProperty('--mq-t', (2 * shift / SPEED + 4).toFixed(1) + 's') // dwa przejazdy + przerwy na końcach
  el.classList.add('mq')
}

let queued = false
function scan() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    for (const el of document.querySelectorAll<HTMLElement>(TITLES)) update(el)
  })
}

export function startMarquee() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true })
  addEventListener('resize', scan)
  document.fonts?.ready.then(scan)
  scan()
}
