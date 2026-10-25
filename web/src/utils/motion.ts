// Ruch w całej aplikacji (warstwy):
// 1. żywe tło — kilka dużych, rozmytych plam ciepłego światła wolno dryfuje pod treścią, na nich drobne ziarno
//    (jak film); przy przewijaniu tło przesuwa się wolniej niż treść (głębia);
// 2. wejścia — karty, wiersze list i sekcje wjeżdżają od dołu po kolei, gdy pojawiają się na ekranie
//    (treść jest ukrywana dopiero, gdy ten skrypt działa — bez niego wszystko widać od razu);
// 3. światło pod kursorem — na komputerze miękka poświata podąża za myszką po karcie.
// 4. (Motion) zakładki — zaznaczenie przesuwa się sprężyście do klikniętej zakładki (dolne menu, „Ogłoszenia / Wydawka”…);
// 5. (Motion) paralaksa — ilustracja na karcie nabożeństwa przesuwa się wolniej niż karta przy przewijaniu.
// Przy „ogranicz ruch” w systemie: tło stoi, bez wejść i bez poświaty.
import { animate, scroll } from 'motion'
const REVEAL = [
  '.card', '.ann', '.ev', '.song', '.ministry', '.view-card', '.dv-card', '.kh-panel', '.hw-feature', '.hw-banner', '.hw-row',
  '.mm-card', '.person', '.goal', '.listen-card', '.more-list', '.timeline > *', '.sermon-notes', '.sv-part', '.form-sec',
  '.wide-list > *', '.hw-col', '.push-card', '.asb-row', '.inbox-item', '.giveaway', '.fact', '.login-card',
].join(',')
const GLOW = 'button.card, button.ann, button.song, button.ev, .ann, .ev, .hw-row, .kh-panel, .hw-feature, .card, .view-card, .dv-card, .mm-card, .more-list button, .person, .goal'

export function startMotion() {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  // 1. żywe tło
  const amb = document.createElement('div')
  amb.className = 'amb'
  amb.setAttribute('aria-hidden', 'true')
  amb.innerHTML = '<i class="amb-a"></i><i class="amb-b"></i><i class="amb-c"></i><span class="amb-grain"></span>'
  document.body.prepend(amb)
  if (still) { document.documentElement.classList.add('still'); return }

  let ticking = false
  addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => { amb.style.setProperty('--sy', String(scrollY)); ticking = false })
  }, { passive: true })

  // 2. wejścia: elementy, które pojawiają się w tej samej klatce, dostają kolejne opóźnienia
  document.documentElement.classList.add('rv-on')
  let batch = 0, batchTimer = 0
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      const el = e.target as HTMLElement
      el.style.setProperty('--rv-d', Math.min(batch++, 8) * 70 + 'ms')
      el.classList.add('rv-in')
      io.unobserve(el)
    }
    clearTimeout(batchTimer); batchTimer = window.setTimeout(() => { batch = 0 }, 120)
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 })
  const seen = new WeakSet()
  const scan = (root: ParentNode) => {
    root.querySelectorAll?.(REVEAL).forEach(el => {
      if (seen.has(el)) return
      seen.add(el)
      // to, co już jest na ekranie przy pierwszym wczytaniu, też wjeżdża (kolejno)
      el.classList.add('rv')
      io.observe(el)
    })
  }
  const app = document.getElementById('app')
  if (app) {
    scan(app)
    new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(n => { if (n.nodeType === 1) { const el = n as Element; if (el.matches?.(REVEAL)) scan(el.parentNode || app); else scan(el) } }) })
      .observe(app, { childList: true, subtree: true })
  }

  // 4. zakładki: wskaźnik pod aktywną zakładką, przesuwany sprężyną
  const TABS: [string, string][] = [['.tabbar', 'button.on'], ['.serve-tabs', 'button[aria-selected=true]'], ['.seg', 'button.on']]
  const placed = new WeakMap<Element, HTMLElement>()
  const place = (box: HTMLElement, sel: string, jump = false) => {
    const on = box.querySelector(sel) as HTMLElement | null
    let ind = placed.get(box)
    if (!ind) { ind = document.createElement('span'); ind.className = 'tab-ind'; box.prepend(ind); placed.set(box, ind); box.classList.add('has-ind'); jump = true }
    if (!on) { ind.style.opacity = '0'; return }
    const b = box.getBoundingClientRect(), r = on.getBoundingClientRect()
    const to = { x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height, opacity: 1 }
    if (jump) Object.assign(ind.style, { transform: `translate(${to.x}px, ${to.y}px)`, width: to.width + 'px', height: to.height + 'px', opacity: '1' })
    else animate(ind, to, { type: 'spring', stiffness: 520, damping: 38 })
  }
  const watchTabs = (root: ParentNode) => {
    for (const [boxSel, onSel] of TABS) root.querySelectorAll?.(boxSel).forEach(box => {
      if (placed.has(box)) return
      place(box as HTMLElement, onSel, true)
      new MutationObserver(() => place(box as HTMLElement, onSel)).observe(box, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] })
    })
  }
  addEventListener('resize', () => { for (const [boxSel, onSel] of TABS) document.querySelectorAll(boxSel).forEach(box => placed.has(box) && place(box as HTMLElement, onSel, true)) })

  // 5. paralaksa ilustracji na karcie nabożeństwa (właściwość „translate” — nie koliduje z powolnym przybliżaniem)
  const para = new WeakSet()
  const watchPara = (root: ParentNode) => {
    root.querySelectorAll?.('.hw-visual').forEach(el => {
      if (para.has(el)) return
      para.add(el)
      scroll((p: number) => { (el as HTMLElement).style.setProperty('--para', ((p - 0.5) * 56).toFixed(1) + 'px') }, { target: el, offset: ['start end', 'end start'] })
    })
  }
  if (app) {
    watchTabs(document); watchPara(app)
    let queued = false // nowe zakładki i karty po zmianie widoku — najwyżej raz na klatkę
    new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; watchTabs(document); watchPara(app) }) }).observe(document.body, { childList: true, subtree: true })
  }

  // 3. światło pod kursorem (tylko mysz)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let last: HTMLElement | null = null
    addEventListener('pointermove', e => {
      const el = (e.target as Element)?.closest?.(GLOW) as HTMLElement | null
      if (last && last !== el) last.classList.remove('glow-on')
      last = el
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', e.clientX - r.left + 'px')
      el.style.setProperty('--my', e.clientY - r.top + 'px')
      el.classList.add('glow-on')
    }, { passive: true })
  }
}
