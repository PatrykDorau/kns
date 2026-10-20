// Przesunięcie palcem w lewo / w prawo (np. zmiana miesiąca w kalendarzu, zakładki) — @touchstart / @touchend.
// Liczy się tylko wyraźny ruch w poziomie (co najmniej 50 px i bardziej w bok niż w pionie), żeby nie przeszkadzać przewijaniu.
// skip: elementy przewijane w poziomie (np. lista niedziel) — tam przesunięcie przewija, nie przełącza
export function useSwipe(onLeft: () => void, onRight: () => void, skip = '') {
  let x = 0, y = 0, off = false
  return {
    swipeStart(e: TouchEvent) { x = e.touches[0].clientX; y = e.touches[0].clientY; off = !!(skip && (e.target as Element)?.closest?.(skip)) },
    swipeEnd(e: TouchEvent) {
      const t = e.changedTouches[0], dx = t.clientX - x, dy = t.clientY - y
      if (off || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx < 0) onLeft(); else onRight()
    },
  }
}
