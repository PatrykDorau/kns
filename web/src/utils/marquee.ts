// Długie tytuły (wydarzenia, ogłoszenia, nabożeństwa na listach): zamiast „…” tekst płynie w lewo bez końca, jak pasek
// wiadomości. Płynie warstwa ::after z tytułem, odstępem i drugą kopią (data-mq), przesuwana przez transform —
// ruch robi karta graficzna: płynnie (ułamki pikseli), także na telefonie i gdy strona jest czymś zajęta.
// Oryginalny tekst zostaje (dla czytników ekranu i zaznaczania), tylko niewidoczny. Pętla bez szwu: jeden obieg to
// tytuł + odstęp — wtedy kopia stoi dokładnie tam, gdzie zaczynał oryginał.
// Działa samo dla elementów z listy TITLES, które się nie mieszczą.
const TITLES = [
  '.ev .body b', '.card .title', '.le-title', '.week-title', '.kh-ann-text b', '.kh-ann-t', '.hw-row-text b',
  'header h1', '.vote-ev-list button b', '.inbox-item b', '.ann b', '.bug-head b', '.deck-text b',
].join(', ')
const SPEED = 40 // px na sekundę
const GAP = ' '.repeat(8) // odstęp między końcem tytułu a jego kopią
const START = 1000 // ms przed pierwszym ruchem — żeby dało się przeczytać początek

const born = new Map<string, number>() // tytuł → kiedy pierwszy raz zaczął płynąć (ponowny pomiar nie cofa na start)
const seen = new WeakMap<HTMLElement, string>() // tekst i szerokość z ostatniego pomiaru — bez zmian nic nie ruszamy

// szerokość tekstu w kroju elementu (bez wstawiania niczego do samego elementu — jego treścią zarządza Vue)
let ruler: HTMLSpanElement = null
function widthOf(text: string, el: HTMLElement) {
  if (!ruler) { ruler = document.createElement('span'); ruler.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden'; document.body.appendChild(ruler) }
  const cs = getComputedStyle(el)
  ruler.style.font = cs.font; ruler.style.letterSpacing = cs.letterSpacing; ruler.style.wordSpacing = cs.wordSpacing; ruler.style.textTransform = cs.textTransform
  ruler.textContent = text
  return ruler.getBoundingClientRect().width
}

function update(el: HTMLElement) {
  const key = el.textContent + '|' + el.clientWidth
  if (seen.get(el) === key) return
  seen.set(el, key)
  if (el.classList.contains('mq')) { el.classList.remove('mq'); el.style.removeProperty('color') }
  if (el.scrollWidth - el.clientWidth <= 2 || !el.clientWidth) return
  const text = el.textContent.trim()
  const cs = getComputedStyle(el)
  const lap = widthOf(text + GAP, el)
  if (!born.has(text)) born.set(text, performance.now())
  el.dataset.mq = text + GAP + text
  el.style.setProperty('--mq-color', cs.color)
  el.style.setProperty('--mq-pl', cs.paddingLeft)
  el.style.setProperty('--mq-pt', cs.paddingTop)
  el.style.setProperty('--mq-lap', lap + 'px')
  el.style.setProperty('--mq-dur', (lap / SPEED).toFixed(2) + 's')
  el.style.setProperty('--mq-delay', ((START - (performance.now() - born.get(text))) / 1000).toFixed(2) + 's') // ujemne — jedzie dalej
  el.style.setProperty('color', 'transparent', 'important') // w stylu elementu — wygrywa z każdą regułą koloru
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

// Także przy „ogranicz ruch” (np. wyłączone efekty animacji w Windows): bez tego długiego tytułu nie da się przeczytać.
export function startMarquee() {
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true })
  addEventListener('resize', scan)
  document.fonts?.ready.then(() => { for (const el of document.querySelectorAll<HTMLElement>(TITLES)) seen.delete(el); scan() })
  scan()
}
