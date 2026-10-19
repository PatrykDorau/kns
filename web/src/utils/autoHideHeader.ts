// Telefon: górny pasek chowa się przy przewijaniu w dół i wraca przy przewijaniu w górę (klasa hdr-hide na <body>).
export function startAutoHideHeader() {
  let last = scrollY, queued = false
  addEventListener('scroll', () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const y = scrollY, d = y - last
      if (Math.abs(d) < 6) return // drobne drgnięcia palca
      document.body.classList.toggle('hdr-hide', d > 0 && y > 80)
      last = y
    })
  }, { passive: true })
}
