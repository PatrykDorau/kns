// Przesunięcie palcem w lewo / w prawo (np. zmiana miesiąca w kalendarzu, zakładki) — @touchstart / @touchmove / @touchend.
// Liczy się tylko wyraźny ruch w poziomie (bardziej w bok niż w pionie), żeby nie przeszkadzać przewijaniu.
// Treść (target — selektor wewnątrz elementu z @touchstart) idzie za palcem; po przełączeniu wyjeżdża w bok,
// a nowa wjeżdża z drugiej strony. Gdy w danym kierunku nie ma dokąd przejść — tylko lekkie „sprężynowanie”.
// skip: elementy przewijane w poziomie (np. lista niedziel) — tam przesunięcie przewija, nie przełącza
import { nextTick } from 'vue'

// czas ostatniego przełączenia przesunięciem wewnątrz widoku — przesunięcie między zakładkami menu (utils/tabSwipe.ts) wtedy czeka
export const swipeState = { last: 0 }
type Opts = { skip?: string, target?: string, canLeft?: () => boolean, canRight?: () => boolean }
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const frame = () => new Promise(r => requestAnimationFrame(() => r(0)))

export function useSwipe(onLeft: () => void, onRight: () => void, opts: Opts | string = {}) {
  const o: Opts = typeof opts === 'string' ? { skip: opts } : opts
  let x = 0, y = 0, off = false, drag = false, el: HTMLElement | null = null, busy = false
  const can = (dx: number) => dx < 0 ? (o.canLeft ? o.canLeft() : true) : (o.canRight ? o.canRight() : true)
  const set = (tr: string, op = '', t = '') => { if (!el) return; el.style.transition = t; el.style.transform = tr; el.style.opacity = op }
  // przejście z animacją: obecna treść wyjeżdża w stronę ruchu, nowa wjeżdża z drugiej strony
  async function slide(dir: -1 | 1, action: () => void, node: HTMLElement | null = el) {
    el = node
    if (!el || still()) { action(); return }
    busy = true
    const w = Math.min(el.offsetWidth * .35, 160)
    set(`translateX(${dir * w}px)`, '0', 'transform .14s ease-in, opacity .14s ease-in')
    await new Promise(r => setTimeout(r, 140))
    action(); await nextTick()
    set(`translateX(${-dir * w}px)`, '0'); await frame(); await frame()
    set('', '', 'transform .24s cubic-bezier(.2,.8,.2,1), opacity .2s ease-out')
    setTimeout(() => { set(''); busy = false }, 260)
  }
  return {
    swipeStart(e: TouchEvent) {
      x = e.touches[0].clientX; y = e.touches[0].clientY; drag = false
      off = busy || !!(o.skip && (e.target as Element)?.closest?.(o.skip))
      const root = e.currentTarget as HTMLElement
      el = o.target ? root?.querySelector?.(o.target) as HTMLElement : root
    },
    swipeMove(e: TouchEvent) {
      if (off || !el || still()) return
      const t = e.touches[0], dx = t.clientX - x, dy = t.clientY - y
      if (!drag) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { off = true; return } // przewijanie w pionie
        if (Math.abs(dx) < 10) return
        drag = true
      }
      const move = can(dx) ? dx * .6 : dx * .15
      set(`translateX(${move}px)`, can(dx) ? String(1 - Math.min(Math.abs(dx) / 600, .35)) : '')
    },
    swipeEnd(e: TouchEvent) {
      const t = e.changedTouches[0], dx = t.clientX - x, dy = t.clientY - y
      const go = !off && Math.abs(dx) >= 50 && Math.abs(dx) >= Math.abs(dy) * 1.5 && can(dx)
      if (go) { swipeState.last = Date.now(); slide(dx < 0 ? -1 : 1, dx < 0 ? onLeft : onRight); return }
      if (drag) { set('', '', 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .2s'); setTimeout(() => { if (!busy) set('') }, 240) }
      drag = false
    },
    // to samo przejście dla strzałek / zakładek (bez palca)
    swipeTo(dir: -1 | 1, action: () => void, node: HTMLElement | null) { if (busy) return; slide(dir, action, node) },
  }
}
