// Tło całej aplikacji: góra z logo KNS z krzyżem — sama kreska, bez kolorów i wypełnień — rysuje się powoli po wczytaniu
// (pathLength=1 i stroke-dashoffset: 1 → 0), za nią dalsze pasma cieńszą linią. Leży pod treścią (#app ma z-index 1),
// nie przechwytuje kliknięć. Przy „ogranicz ruch” — od razu narysowana.
const SVG = `<svg viewBox="0 0 1600 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <path class="kb-far" pathLength="1" d="M-40 520 L180 300 L262 382 L330 330 L520 520 M1080 520 L1290 280 L1372 372 L1436 320 L1660 520" />
  <path class="kb-ridge" pathLength="1" d="M440 520 L800 128 L950 276 L1070 216 L1430 520" />
  <path class="kb-cross" pathLength="1" d="M800 128 V52 M776 76 H824" />
</svg>`

export function startBackdrop() {
  if (document.querySelector('.kns-backdrop')) return
  const el = document.createElement('div')
  el.className = 'kns-backdrop'
  el.innerHTML = SVG
  document.body.prepend(el)
}
