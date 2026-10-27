// Długie tytuły (wydarzenia, ogłoszenia, nabożeństwa na listach): zamiast „…” tekst płynie w lewo bez końca, jak pasek
// wiadomości — za nim, po odstępie, jego kopia (::after z data-mq), więc pętla jest ciągła, bez cofania.
// Działa samo dla elementów z listy TITLES, które się nie mieszczą.
const TITLES = [
  '.ev .body b', '.card .title', '.le-title', '.week-title', '.kh-ann-text b', '.kh-ann-t', '.hw-row-text b',
  'header h1', '.vote-ev-list button b', '.inbox-item b', '.ann b', '.bug-head b', '.deck-text b',
].join(', ')
const SPEED = 40 // px na sekundę
const GAP = 48 // px odstępu między końcem tytułu a jego kopią
const START = 1000 // ms przed pierwszym ruchem — żeby dało się przeczytać początek
const running = new WeakMap<HTMLElement, Animation>()

const seen = new WeakMap<HTMLElement, string>() // tekst i szerokość z ostatniego pomiaru — bez zmian nic nie ruszamy (animacja trwa)
function update(el: HTMLElement) {
  const key = el.textContent + '|' + el.clientWidth
  if (seen.get(el) === key) return
  seen.set(el, key)
  running.get(el)?.cancel(); running.delete(el)
  el.classList.remove('mq')
  const full = el.scrollWidth // szerokość całego tytułu (bez kopii)
  if (full - el.clientWidth <= 2 || !el.clientWidth) return
  el.dataset.mq = el.textContent.trim()
  el.style.setProperty('--mq-gap', GAP + 'px')
  el.classList.add('mq')
  // jeden obieg = tytuł + odstęp; na końcu kopia stoi dokładnie tam, gdzie zaczynał oryginał — pętla bez szwu
  const lap = full + GAP
  running.set(el, el.animate([{ textIndent: '0px' }, { textIndent: -lap + 'px' }], { duration: lap / SPEED * 1000, delay: START, iterations: Infinity, easing: 'linear' }))
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
