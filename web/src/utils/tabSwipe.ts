// Telefon: przesunięcie palcem w lewo / w prawo przechodzi do sąsiedniej zakładki dolnego menu
// (Start ↔ Kalendarz ↔ Zaangażuj się ↔ Więcej). Pierwszeństwo mają: przesunięcia wewnątrz widoku (miesiąc w kalendarzu,
// zakładki służb — utils/swipe.ts), poziomo przewijane listy, pola tekstowe i okna. Nowy widok lekko wjeżdża z boku.
import { swipeState } from './swipe'

const SKIP = 'input, textarea, select, [contenteditable], .ui-select-list, .np-overlay, .ask-overlay, dialog, .tabbar, .deck'
// czy coś pod palcem przewija się w poziomie
function scrollsX(el: Element | null) {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true }
  }
  return false
}
export function startTabSwipe(current: () => number, go: (i: number) => void, count = 4) {
  let x = 0, y = 0, t = 0, off = true
  addEventListener('touchstart', e => {
    const el = e.target as Element
    const bar = document.querySelector('.tabbar') as HTMLElement | null
    off = e.touches.length > 1 || !bar || getComputedStyle(bar).display === 'none' || current() < 0 || !!el?.closest?.(SKIP) || scrollsX(el)
    x = e.touches[0].clientX; y = e.touches[0].clientY; t = Date.now()
  }, { passive: true })
  addEventListener('touchend', e => {
    if (off) return
    const p = e.changedTouches[0], dx = p.clientX - x, dy = p.clientY - y
    if (Date.now() - swipeState.last < 400 || Date.now() - t > 800) return
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return
    const i = current() + (dx < 0 ? 1 : -1)
    if (i < 0 || i >= count) return
    go(i)
    // nowy widok lekko wjeżdża z boku — przez Web Animations (bez podmiany animacji CSS: zdjęcie klasy odpalało
    // od nowa zwykłe pojawianie się nagłówka i treści, tytuł „mrugał” drugi raz); nagłówek stoi w miejscu
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = dx < 0 ? 36 : -36
    requestAnimationFrame(() => {
      for (const el of document.querySelectorAll('#app > :not(header):not(.tabbar):not(.side):not(.toast)'))
        (el as HTMLElement).animate([{ opacity: 0.4, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' })
    })
  }, { passive: true })
}
