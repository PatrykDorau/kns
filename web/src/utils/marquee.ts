// Długie tytuły (wydarzenia, ogłoszenia, nabożeństwa na listach): zamiast „…” tekst powoli przesuwa się w pętli
// — w lewo do końca, chwila przerwy, z powrotem. Działa samo dla elementów z listy TITLES, które się nie mieszczą.
const TITLES = [
  '.ev .body b', '.card .title', '.le-title', '.week-title', '.kh-ann-text b', '.kh-ann-t', '.hw-row-text b',
  'header h1', '.vote-ev-list button b', '.inbox-item b', '.ann b', '.bug-head b',
].join(', ')
const SPEED = 45 // px na sekundę
const PAUSE = 1200 // ms przerwy na początku i na końcu (stała — przy długim tytule procent cyklu dawał kilka sekund bezruchu)
const running = new WeakMap<HTMLElement, Animation>()

const seen = new WeakMap<HTMLElement, string>() // tekst i szerokość z ostatniego pomiaru — bez zmian nic nie ruszamy (animacja trwa)
function update(el: HTMLElement) {
  const key = el.textContent + '|' + el.clientWidth
  if (seen.get(el) === key) return
  seen.set(el, key)
  running.get(el)?.cancel(); running.delete(el)
  el.classList.remove('mq')
  const shift = el.scrollWidth - el.clientWidth
  if (shift <= 2 || !el.clientWidth) return
  el.classList.add('mq')
  // przerwa → do końca → przerwa → z powrotem (Web Animations — dokładne czasy niezależnie od długości)
  const move = shift / SPEED * 1000, total = 2 * move + 2 * PAUSE
  const at = ms => ms / total
  running.set(el, el.animate([
    { textIndent: '0px', offset: 0 },
    { textIndent: '0px', offset: at(PAUSE), easing: 'ease-in-out' },
    { textIndent: -shift + 'px', offset: at(PAUSE + move) },
    { textIndent: -shift + 'px', offset: at(2 * PAUSE + move), easing: 'ease-in-out' },
    { textIndent: '0px', offset: 1 },
  ], { duration: total, iterations: Infinity }))
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

// Także przy „ogranicz ruch” (np. wyłączone efekty animacji w Windows): bez tego długiego tytułu nie da się przeczytać.
export function startMarquee() {
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true })
  addEventListener('resize', scan)
  document.fonts?.ready.then(scan)
  scan()
}
