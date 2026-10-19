// Pomocnicze do szablonów: fokus na polu, gdy się pojawi — :ref="focusEl" (za każdym razem)
// albo :ref="focusOnce" (tylko pierwszy raz, np. pole tekstu, które przerysowuje się przy pisaniu).
type RefEl = Element | { $el?: Element } | null

export function focusEl(el: RefEl) {
  if (el instanceof HTMLElement) el.focus()
}

export function focusOnce(el: RefEl) {
  if (el instanceof HTMLElement && !el.dataset.f) { el.dataset.f = '1'; el.focus() }
}
