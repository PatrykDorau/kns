// Telefon: przesunięcie palcem w lewo / w prawo przechodzi do sąsiedniej zakładki dolnego menu
// (Start ↔ Kalendarz ↔ Zaangażuj się ↔ Więcej).
// - Gest liczy się tylko wtedy, gdy od początku idzie wyraźnie w bok (kierunek ustalany po ~14 px) — przewijanie
//   w pionie (np. grafik, listy) już nie przełącza strony.
// - Nie działa w miejscach, które same coś robią palcem albo przewijają się w bok: tabele (grafik, dyspozycyjność),
//   kafelki niedziel, przełączniki i zakładki, mapa, miesiąc w kalendarzu, okna, pola tekstowe; ani przy samej krawędzi
//   ekranu (gest „wstecz” telefonu).
// - W trakcie: treść jedzie za palcem, z boku rośnie dymek z ikoną i nazwą strony docelowej, a w dolnym menu podświetla
//   się jej zakładka. Dymek wypełnia się kolorem, gdy puszczenie palca przeniesie na tę stronę.
import { swipeState } from './swipe'

const SKIP = [
  'input, textarea, select, [contenteditable], .ui-select-list, .np-overlay, .ask-overlay, dialog, .tabbar, .deck, .hm-story, .sheet, .kh-modal',
  '.cal-month, .sg-wrap, .avail-table-wrap, .avail-days, .avail-table, table, .ms-pick, .ms-tabs, .serve-tabs, .seg, .chips, .cal-presets',
  '.km-card, .km-svg, .hm-quick, .ann-deck, .mo-arc, [data-no-tab-swipe]',
].join(', ')
const NAMES = ['Start', 'Kalendarz', 'Zaangażuj się', 'Więcej']
const EDGE = 18 // px od krawędzi ekranu — tam działa gest systemu
const ARM = 96 // px przesunięcia, po którym puszczenie przechodzi dalej
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// czy coś pod palcem przewija się w poziomie
function scrollsX(el: Element | null) {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true }
  }
  return false
}
const content = () => [...document.querySelectorAll('#app > :not(header):not(.tabbar):not(.side):not(.toast):not(.swipe-hint)')] as HTMLElement[]
const tabBtn = (i: number) => [...document.querySelectorAll('.tabbar button')].find(b => b.textContent?.includes(NAMES[i])) as HTMLElement | undefined

// dymek z nazwą strony docelowej (jeden na całą aplikację)
let hint: HTMLElement | null = null
function showHint(i: number, dir: -1 | 1, p: number) {
  if (!hint) {
    hint = document.createElement('div')
    hint.className = 'swipe-hint'
    hint.setAttribute('aria-hidden', 'true')
    document.body.appendChild(hint)
  }
  const key = i + ':' + dir
  if (hint.dataset.key !== key) {
    hint.dataset.key = key
    const icon = tabBtn(i)?.querySelector('svg')?.outerHTML || ''
    hint.innerHTML = dir > 0 ? `<span>${NAMES[i]}</span>${icon}<b>›</b>` : `<b>‹</b>${icon}<span>${NAMES[i]}</span>`
    hint.classList.toggle('left', dir < 0)
  }
  const armed = p >= 1
  hint.classList.toggle('armed', armed)
  hint.style.opacity = String(Math.min(1, p * 1.4))
  hint.style.transform = `translate(${dir > 0 ? (1 - Math.min(p, 1)) * 40 : -(1 - Math.min(p, 1)) * 40}px, -50%) scale(${0.85 + Math.min(p, 1) * 0.15})`
  for (const b of document.querySelectorAll('.tabbar button.swipe-target')) b.classList.remove('swipe-target')
  if (p > 0.25) tabBtn(i)?.classList.add('swipe-target')
}
function hideHint() {
  if (hint) { hint.style.opacity = '0'; hint.classList.remove('armed'); hint.dataset.key = '' }
  for (const b of document.querySelectorAll('.tabbar button.swipe-target')) b.classList.remove('swipe-target')
}
function moveContent(px: number, t = '') {
  for (const el of content()) { el.style.transition = t; el.style.transform = px ? `translateX(${px}px)` : ''; el.style.opacity = px ? String(1 - Math.min(Math.abs(px) / 500, 0.25)) : '' }
}

export function startTabSwipe(current: () => number, go: (i: number) => void, count = 4) {
  let start: Element | null = null
  let x = 0, y = 0, t = 0, state: 'off' | 'wait' | 'drag' = 'off', target = -1, dx = 0
  addEventListener('touchstart', e => {
    const el = e.target as Element
    start = el
    const bar = document.querySelector('.tabbar') as HTMLElement | null
    x = e.touches[0].clientX; y = e.touches[0].clientY; t = Date.now(); dx = 0
    const off = e.touches.length > 1 || !bar || getComputedStyle(bar).display === 'none' || current() < 0 || !!el?.closest?.(SKIP) || scrollsX(el)
      || x < EDGE || x > innerWidth - EDGE || Date.now() - swipeState.last < 400
    state = off ? 'off' : 'wait'
  }, { passive: true })
  addEventListener('touchmove', e => {
    if (state === 'off') return
    const p = e.touches[0]; dx = p.clientX - x; const dy = p.clientY - y
    if (state === 'wait') {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return
      // wyraźnie w bok — inaczej to przewijanie i gest się kończy
      if (Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - swipeState.last < 400) { state = 'off'; return }
      // widok sam obsługuje ten kierunek (np. Wszystkie służby → Moja służba): data-swipe-claim="left|right|both"
      const claim = (start?.closest?.('[data-swipe-claim]') as HTMLElement | null)?.dataset.swipeClaim || ''
      if (claim === 'both' || claim === (dx < 0 ? 'left' : 'right')) { state = 'off'; return }
      state = 'drag'
    }
    if (e.cancelable) e.preventDefault() // w trakcie przesuwania w bok strona nie przewija się w pionie
    const i = current() + (dx < 0 ? 1 : -1)
    target = i >= 0 && i < count ? i : -1
    if (target < 0) { moveContent(dx * 0.12); hideHint(); return } // dalej nie ma dokąd — lekkie sprężynowanie
    if (!still()) moveContent(dx * 0.45)
    showHint(target, dx < 0 ? 1 : -1, Math.abs(dx) / ARM)
  }, { passive: false })
  const end = () => {
    if (state !== 'drag') { state = 'off'; return }
    state = 'off'
    const fast = Math.abs(dx) > 60 && Math.abs(dx) / Math.max(1, Date.now() - t) > 0.6 // szybki ruch też wystarczy
    const going = target >= 0 && (Math.abs(dx) >= ARM || fast)
    hideHint()
    if (!going) { moveContent(0, 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .2s'); setTimeout(() => moveContent(0), 240); return }
    const dir = dx < 0 ? 1 : -1, i = target
    if (still()) { moveContent(0); go(i); return }
    // obecna treść wyjeżdża w stronę ruchu, nowa wjeżdża z drugiej strony
    moveContent(-dir * 90, 'transform .14s ease-in, opacity .14s ease-in')
    for (const el of content()) el.style.opacity = '0'
    setTimeout(() => {
      moveContent(0)
      go(i)
      requestAnimationFrame(() => {
        for (const el of content()) el.animate([{ opacity: 0, transform: `translateX(${dir * 60}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' })
      })
    }, 140)
  }
  addEventListener('touchend', end, { passive: true })
  addEventListener('touchcancel', () => { if (state === 'drag') { hideHint(); moveContent(0, 'transform .2s') } state = 'off' }, { passive: true })
}
