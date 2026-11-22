// Mała „sprężyna” na Web Animations — zamiast biblioteki Motion (60 KB pobierane przy każdym starcie aplikacji).
// Animuje z obecnego wyglądu do docelowego z lekkim przestrzeleniem, a na końcu zostawia styl docelowy na elemencie.
export function springTo(el: HTMLElement, to: Record<string, string>, duration = 360): Promise<void> {
  const cs = getComputedStyle(el)
  const from: Record<string, string> = {}
  for (const k of Object.keys(to)) from[k] = (cs as unknown as Record<string, string>)[k]
  Object.assign(el.style, to)
  if (typeof el.animate !== 'function') return Promise.resolve()
  const a = el.animate([from, to], { duration, easing: 'cubic-bezier(.22, 1.25, .36, 1)' })
  return a.finished.then(() => undefined, () => undefined)
}
