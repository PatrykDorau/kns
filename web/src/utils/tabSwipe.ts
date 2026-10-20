// Telefon: przesunięcie palcem w lewo / w prawo przechodzi do sąsiedniej zakładki dolnego menu
// (Start ↔ Kalendarz ↔ Zaangażuj się ↔ Więcej). Pierwszeństwo mają: przesunięcia wewnątrz widoku (miesiąc w kalendarzu,
// zakładki służb — utils/swipe.ts), poziomo przewijane listy, pola tekstowe i okna. Nowy widok lekko wjeżdża z boku.
import { swipeState } from './swipe'

const SKIP = 'input, textarea, select, [contenteditable], .ui-select-list, .np-overlay, .ask-overlay, dialog, .tabbar'
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
    const app = document.getElementById('app')
    app?.classList.remove('tab-in-l', 'tab-in-r')
    go(i)
    if (app && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void app.offsetWidth
      app.classList.add(dx < 0 ? 'tab-in-l' : 'tab-in-r')
      setTimeout(() => app.classList.remove('tab-in-l', 'tab-in-r'), 360)
    }
  }, { passive: true })
}
