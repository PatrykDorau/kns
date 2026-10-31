// Odliczanie: układy planszy i style zegara (wybierane w Studio → Odliczanie). Każdy układ rysuje tło,
// treść (ogłoszenia w pętli albo własny napis) i zegar w wybranym stylu; zwraca, ile sekund zostało.
import { H, W, studio } from './state'
import { fit, fitLine, fontStr, g, img, paintOn, rounded, setHalo, text, wrap } from './paint'
import { carousel, cdBackground, countdownLeft, drawCarousel, fill, paper, setDemo, topWave } from './cards'
import { clockWidth, glassPanel, hairline, roughClock, roughFit, roughText, shade, steady } from './rough'
import { cleanInk, pill } from './clean'
import { mediaSlide, mediaUrl } from './media'
import { BACKGROUNDS, LIGHT_BG } from './backgrounds'
import { drawPeak } from './peak'

export const LAYOUTS = [
  ['rock', 'Skała', 'Wielki napis i zegar z lewej, ogłoszenia w poszarpanym panelu'],
  ['edit', 'Czysty', 'Elegancki napis, data i nabożeństwo, ogłoszenie w ramce'],
  ['top', 'Klasyczny', 'Zegar u góry, w środku ogłoszenia w pętli'],
  ['center', 'Duży zegar', 'Duży zegar na środku, pod nim podpis'],
  ['split', 'Dzielony', 'Zdjęcie z lewej z zegarem w dymku, po prawej ogłoszenia albo napis — w kolorowej ramce'],
  ['poster', 'Plakat', 'Duży napis i zegar z lewej, ogłoszenie z prawej (przechylone)'],
  ['bar', 'Pasek', 'Ogłoszenia na cały ekran, zegar w pasku u dołu'],
  ['minimal', 'Minimal', 'Cienka ramka, napis rozstrzelony u góry, sam zegar'],
] as const
export const TIMERS = [
  ['blob', 'Plakietka'], ['bubble', 'Dymek'], ['pill', 'Pigułka'], ['flip', 'Klapki'], ['plain', 'Same cyfry'],
] as const

const clockStr = (left: number) => {
  const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0')
}
const shadow = (blur = 30, y = 10, c = 'rgba(0,0,0,0.35)') => { g.shadowColor = c; g.shadowBlur = blur; g.shadowOffsetY = y }

/* ---------- zegary ---------- */
type TimerOpt = { ink?: string, cx: number, cy: number, scale?: number, title?: string, done?: string, accent: string, light: boolean }
export function drawTimer(style: string, o: TimerOpt) {
  const left = countdownLeft(), s = o.scale || 1, after = String(o.done || '').toUpperCase().trim().split(/\s+/)
  const clock = left ? clockStr(left) : after.pop() // po zerze: ostatnie słowo jako główne, reszta nad nim
  const title = left ? String(o.title || '').toUpperCase() : after.join(' ')
  if (!clock) return left
  const ink = o.ink || (o.light ? '#2b2b2b' : '#fff')
  if (style === 'bubble') {
    // dymek w kolorze akcentu, cyfry szeryfową kursywą (jak w zapowiedziach na plakatach)
    const cw = clockWidth(clock, 170 * s, 'serif', 400, true) // szerokość z komórek cyfr — dymek nie zmienia się co sekundę
    const w = Math.max(460 * s, cw + 120 * s), h = 260 * s, x = o.cx - w / 2, y = o.cy - h / 2
    g.save(); g.translate(o.cx, o.cy); g.rotate(-0.025); g.translate(-o.cx, -o.cy)
    g.save(); shadow(34, 14); g.beginPath(); g.roundRect(x, y, w, h, 18 * s)
    g.moveTo(x + 130 * s, y + h - 24 * s); g.lineTo(x + 56 * s, y + h + 70 * s); g.lineTo(x + 60 * s, y + h - 24 * s); g.closePath()
    g.fillStyle = o.accent; g.fill(); g.restore()
    if (title) text(title, o.cx, y + 58 * s, { size: 30 * s, weight: 700, font: 'cond', align: 'center', color: 'rgba(255,255,255,0.85)', spacing: 6 * s })
    const f = { size: left ? 170 * s : fitLine(clock, w - 60 * s, 170 * s, 60 * s, 400, 'serif', true).size }
    steady((c, x2) => text(c, x2, y + h - 50 * s, { size: f.size, weight: 400, font: 'serif', italic: true, align: 'center' }), clock, o.cx, f.size, 'serif', 400, 'center', true)
    g.restore()
  } else if (style === 'pill') {
    // ciemna pigułka z obwódką: napis z lewej, cyfry z prawej
    const cw = clockWidth(clock, 120 * s, 'cond', 700)
    g.save(); g.font = fontStr(700, 34 * s, 'cond'); const tw = title ? Math.min(260 * s, g.measureText(title).width) : 0; g.restore()
    const h = 170 * s, w = cw + tw + (title ? 150 : 100) * s, x = o.cx - w / 2, y = o.cy - h / 2
    g.save(); shadow(30, 10); rounded(x, y, w, h, h / 2); g.fillStyle = 'rgba(17,17,20,0.9)'; g.fill(); g.restore()
    g.save(); g.lineWidth = 5 * s; g.strokeStyle = o.accent; rounded(x + 8 * s, y + 8 * s, w - 16 * s, h - 16 * s, h / 2 - 8 * s); g.stroke(); g.restore()
    if (title) wrap(title, 260 * s, 34 * s, 700, 2, 'cond').forEach((l, i, a) => text(l, x + 60 * s, o.cy + (i - (a.length - 1) / 2) * 38 * s + 12 * s, { size: 34 * s, weight: 700, font: 'cond', color: '#f3e3c8', spacing: 2 * s }))
    steady((c, x2) => text(c, x2, o.cy + 42 * s, { size: 120 * s, weight: 700, font: 'cond', color: o.accent, align: 'center' }), clock, x + w - 50 * s, 120 * s, 'cond', 700, 'right')
  } else if (style === 'flip') {
    // każda cyfra na swojej klapce (jak tablica odlotów)
    const cw = 118 * s, ch = 168 * s, gap = 12 * s, colon = 44 * s
    const chars = [...clock], digits = chars.filter(c => c !== ':').length, colons = chars.length - digits
    const big = !left
    if (big) { const f = fitLine(clock, 1400 * s, 150 * s, 60, 700, 'cond'); text(f.str, o.cx, o.cy + 52 * s, { size: f.size, weight: 700, font: 'cond', align: 'center', color: ink, shadow: o.light ? 0 : 20 }) }
    else {
      let x = o.cx - (digits * cw + (digits - 1) * gap + colons * colon) / 2
      const y = o.cy - ch / 2 + 16 * s
      for (const c of chars) {
        if (c === ':') { text(':', x + colon / 2 - gap / 2, y + ch * 0.72, { size: 110 * s, weight: 700, font: 'cond', align: 'center', color: ink }); x += colon; continue }
        g.save(); shadow(18, 8, 'rgba(0,0,0,0.4)'); rounded(x, y, cw, ch, 14 * s)
        const gr = g.createLinearGradient(0, y, 0, y + ch); gr.addColorStop(0, '#2c2c30'); gr.addColorStop(0.5, '#1d1d20'); gr.addColorStop(0.5, '#151517'); gr.addColorStop(1, '#202024')
        g.fillStyle = gr; g.fill(); g.restore()
        text(c, x + cw / 2, y + ch * 0.77, { size: 140 * s, weight: 700, font: 'cond', align: 'center', color: o.accent })
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y + ch / 2 - 1.5 * s, cw, 3 * s)
        x += cw + gap
      }
    }
    if (title) text(title, o.cx, o.cy - ch / 2 - 18 * s, { size: 36 * s, weight: 700, font: 'cond', align: 'center', color: ink, spacing: 8 * s, shadow: o.light ? 0 : 14 })
  } else if (style === 'plain') {
    // same duże cyfry
    if (title) text(title, o.cx, o.cy - 168 * s, { size: 40 * s, weight: 700, font: 'cond', align: 'center', color: o.ink || (o.light ? '#2b2b2b' : '#f3e3c8'), spacing: 10 * s, shadow: o.light ? 0 : 14 })
    roughClock(clock, o.cx, o.cy + 90 * s, { size: left ? 250 * s : roughFit(clock, 1500 * s, 250 * s, 80), align: 'center', color: o.ink || (o.light ? '#2b2b2b' : '#f4ecdf') })
  } else {
    // plakietka z falowanym brzegiem (kolor obwódki logo), cyfry w kolorze akcentu
    const rx = (left >= 3600 ? 310 : 265) * s, ry = 130 * s
    g.save(); g.beginPath()
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2, wob = 1 + 0.035 * Math.sin(a * 14)
      const x = o.cx + Math.cos(a) * rx * wob, y = o.cy + Math.sin(a) * ry * wob
      i ? g.lineTo(x, y) : g.moveTo(x, y)
    }
    g.closePath(); shadow(30, 8, 'rgba(0,0,0,0.3)'); g.fillStyle = '#2b2b2b'; g.fill(); g.restore()
    const label = fitLine(title, rx * 1.5, 30 * s, 18 * s, 800)
    if (title) text(label.str, o.cx, o.cy - 46 * s, { size: left ? label.size : 30 * s, weight: 800, color: '#f3e3c8', align: 'center' })
    // bez napisu cyfry dokładnie na środku plakietki
    const big = (left ? 112 : 64) * s, base = title ? o.cy + (left ? 64 : 46) * s : o.cy + big * 0.36
    steady((c, x2) => text(c, x2, base, { size: big, weight: 800, color: o.accent, align: 'center' }), clock, o.cx, big, 'ui', 800, 'center')
  }
  return left
}

/* ---------- treść: ogłoszenia w pętli (albo karta nabożeństwa) w ramce ---------- */
function annBox(t, x, y, w, h, r = 18) {
  const c = carousel(t)
  if (!c) return // bez ogłoszeń ramki nie ma
  const prevHalo = setHalo('')
  g.save(); shadow(50, 18, 'rgba(40,30,20,0.35)'); rounded(x, y, w, h, r); g.fillStyle = '#fff'; g.fill(); g.restore()
  g.save(); rounded(x, y, w, h, r); g.clip()
  drawCarousel(c, x, y, w, h)
  g.restore(); setHalo(prevHalo)
}
// napis jako treść (gdy wybrane „Napis” albo w układach bez ogłoszeń): duży, wąską czcionką, do 3 linii
function bigText(str, x, y, w, { size = 130, color = '#2b2b2b', align = 'left', lines = 3, shadowPx = 0 } = {}) {
  const ls = wrap(String(str || '').toUpperCase(), w, size, 700, lines, 'cond')
  ls.forEach((l, i) => text(l, align === 'center' ? x + w / 2 : x, y + i * size * 0.98, { size, weight: 700, font: 'cond', color, align, shadow: shadowPx }))
  return ls.length * size * 0.98
}
// lewa strona układu „Dzielony”: góry (domyślnie), szkic, papier, kolor akcentu albo grafika z Biblioteki
function photo(L, x, y, w, h) {
  const id = L.photo || '', it = id && !id.startsWith('@') && mediaSlide(id), im = it?.type === 'image' && img(mediaUrl(it.path))
  const lightSide = id === '@sketch' || id === '@paper'
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip()
  if (im) fit(im, im.naturalWidth, im.naturalHeight, x, y, w, h, 'cover')
  else if (id === '@sketch') BACKGROUNDS.sketch()
  else if (id === '@paper') paper()
  else if (id === '@accent') { const a = g.createLinearGradient(x, y, x + w, y + h); a.addColorStop(0, L.accent || '#f6a836'); a.addColorStop(1, '#2b2b2b'); g.fillStyle = a; g.fillRect(x, y, w, h) }
  else drawPeak('szczyt')
  // ciepłe przyciemnienie, żeby zegar się wyróżniał (na jasnych — delikatne)
  const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, lightSide ? 'rgba(30,18,10,0.04)' : 'rgba(30,18,10,0.15)'); gr.addColorStop(1, lightSide ? 'rgba(30,18,10,0.16)' : 'rgba(30,18,10,0.55)')
  g.fillStyle = gr; g.fillRect(x, y, w, h)
  g.restore()
}
function logoAt(x, y, size, ring = true) {
  if (ring) { g.save(); shadow(20, 6, 'rgba(0,0,0,0.3)'); g.beginPath(); g.arc(x + size / 2, y + size / 2, size / 2 + size * 0.09, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore() }
  const lg = img('./znak-obrys.png'); if (lg) g.drawImage(lg, x, y, size, size)
}

/* ---------- układy ---------- */
export function drawCountdown(L, t) {
  const prev = setHalo(LIGHT_BG.includes(L.bg) && L.layout !== 'edit' ? 'rgba(244,237,227,0.92)' : '')
  try { return layout(L, t) } finally { setHalo(prev) }
}
function layout(L, t) {
  const light = LIGHT_BG.includes(L.bg), accent = L.accent || '#f6a836', ink = L.ink || (light ? '#2b2b2b' : '#fff')
  const T = (cx, cy, scale = 1, light2 = light) => drawTimer(L.timer, { cx, cy, scale, title: L.title, done: L.done, accent, light: light2, ink: L.ink })
  const foot = fill(L.foot), subText = fill(L.sub)
  const showText = L.show === 'text' && L.sub
  switch (L.layout) {
    case 'rock': return rockLayout(L, t, accent, foot, subText)
    case 'edit': return cleanLayout(L, t, foot, subText)
    case 'center': {
      cdBackground(L, t)
      const left = T(W / 2, H / 2 - 40, L.timer === 'blob' ? 1.7 : 1.5)
      if (subText) { const s = fitLine(subText, W - 240, 56, 34, 700); text(s.str, W / 2, H / 2 + 300, { size: s.size, weight: 700, align: 'center', color: ink, shadow: light ? 0 : 18 }) }
      return left
    }
    case 'split': {
      // kolorowa ramka z fakturą papieru, w niej zdjęcie z lewej i jasna strona z prawej
      g.fillStyle = accent; g.fillRect(0, 0, W, H)
      g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55; paper(); g.restore()
      const m = 56, x = m, y = m, w = W - 2 * m, h = H - 2 * m, lw = Math.round(w * 0.38)
      g.save(); rounded(x, y, w, h, 34); g.clip()
      g.save(); g.translate(0, 0); if (L.bg === 'image') paper(); else cdBackground(L, t, false); g.restore()
      photo(L, x, y, lw, h)
      g.restore()
      const rx = x + lw + 70, rw = w - lw - 140, lightR = L.bg === 'image' || light
      if (showText) {
        const hh = Math.min(3, wrap(L.sub.toUpperCase(), rw, 150, 700, 3, 'cond').length) * 147
        bigText(L.sub, rx, y + h / 2 - hh / 2 + 120, rw, { size: 150, color: lightR ? '#2b2b2b' : '#fff', align: 'center', shadowPx: lightR ? 0 : 20 })
      } else {
        const bw = rw, bh = bw * 9 / 16
        annBox(t, rx, y + (h - bh) / 2, bw, bh, 14)
      }
      const nx = foot
      if (nx) text(nx.toUpperCase(), rx + rw / 2, y + h - 46, { size: 42, weight: 700, font: 'cond', align: 'center', color: lightR ? '#5d5146' : '#f3e3c8', spacing: 4 })
      return L.timer === 'plain' || L.timer === 'flip' ? T(x + lw / 2, y + 250, 0.6, false) : T(x + lw * 0.72, y + 250, 0.95, false)
    }
    case 'poster': {
      cdBackground(L, t, false)
      if (!light) { const gr = g.createLinearGradient(0, 0, W * 0.6, 0); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
      // ogłoszenie z prawej, lekko przechylone
      const bw = 900, bh = bw * 9 / 16, bx = W - bw - 130, by = (H - bh) / 2 - 10
      if (showText) bigText(L.sub, bx, by + 140, bw, { size: 120, color: ink, align: 'center', shadowPx: light ? 0 : 20 })
      else { g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(0.03); g.translate(-(bx + bw / 2), -(by + bh / 2)); annBox(t, bx, by, bw, bh, 12); g.restore() }
      // z lewej: logo, rozstrzelona nazwa, duży napis i zegar
      logoAt(120, 110, 96)
      if (L.brand) text(L.brand.toUpperCase(), 250, 172, { size: 34, weight: 700, font: 'cond', color: ink, spacing: 8, shadow: light ? 0 : 12 })
      g.fillStyle = accent; g.fillRect(120, 280, 120, 10)
      const left = countdownLeft()
      const head = left ? L.title : L.done
      const hl = wrap(String(head || '').toUpperCase(), 700, 120, 700, 2, 'cond')
      hl.forEach((l, i) => text(l, 116, 420 + i * 116, { size: 120, weight: 700, font: 'cond', color: ink, shadow: light ? 0 : 20 }))
      const ty = 420 + hl.length * 116 + 110
      if (left) {
        if (L.timer === 'plain' || L.timer === 'flip') steady((c, x2) => text(c, x2, ty + 70, { size: 230, weight: 700, font: 'cond', color: accent, align: 'center', shadow: light ? 0 : 24 }), clockStr(left), 112, 230, 'cond', 700)
        else drawTimer(L.timer, { cx: L.timer === 'pill' ? 380 : 400, cy: ty, scale: L.timer === 'pill' ? 1.3 : 0.95, title: '', accent, light })
      }
      const nx = foot
      if (nx) text(nx.toUpperCase(), 120, H - 86, { size: 44, weight: 700, font: 'cond', color: light ? '#5d5146' : '#f3e3c8', spacing: 5 })
      return left
    }
    case 'bar': {
      // tło, ogłoszenie (całe) nad paskiem; u dołu ciemny pasek z napisem, nabożeństwem i zegarem
      const bh = 170, y = H - bh
      cdBackground(L, t)
      if (showText) bigText(L.sub, 120, y / 2 - 60, W - 240, { size: 150, color: ink, align: 'center', lines: 3, shadowPx: light ? 0 : 20 })
      else { const ah = y - 80, aw = ah * 16 / 9; annBox(t, (W - aw) / 2, 40, aw, ah, 16) }
      const prevHalo = setHalo('')
      g.fillStyle = '#121214'; g.fillRect(0, y, W, bh)
      g.fillStyle = accent; g.fillRect(0, y, W, 6)
      logoAt(60, y + 38, 94)
      const left = countdownLeft(), clk = left ? clockStr(left) : ''
      const head = String((left ? L.title : L.done) || '').toUpperCase()
      const cw = clk ? clockWidth(clk, 130, 'cond', 700) : 0
      g.save()
      g.font = fontStr(700, 54, 'cond'); g.letterSpacing = '6px'; const hw = g.measureText(head).width; g.restore()
      text(head, 200, y + 108, { size: 54, weight: 700, font: 'cond', color: L.ink || '#fff', spacing: 6 })
      const dotX = W - 70 - cw - 40
      if (clk) {
        steady((c, x2) => text(c, x2, y + 132, { size: 130, weight: 700, font: 'cond', color: accent, align: 'center' }), clk, W - 70, 130, 'cond', 700, 'right')
        // kropka „na żywo wkrótce” pulsuje
        g.save(); g.globalAlpha = 0.5 + 0.5 * Math.sin(t / 300); g.fillStyle = '#e5484d'; g.beginPath(); g.arc(dotX, y + 88, 12, 0, Math.PI * 2); g.fill(); g.restore()
      }
      const nx = foot, a0 = 200 + hw + 60, a1 = (clk ? dotX - 40 : W - 70)
      if (nx && a1 - a0 > 200) { const f = fitLine(nx.toUpperCase(), a1 - a0 - 40, 42, 22, 700, 'cond'); text(f.str, (a0 + a1) / 2, y + 104, { size: f.size, weight: 700, font: 'cond', color: L.ink || '#a9a39b', align: 'center' }) }
      setHalo(prevHalo)
      return left
    }
    case 'minimal': {
      cdBackground(L, t, false)
      const line = light ? 'rgba(43,43,43,0.55)' : 'rgba(255,255,255,0.45)'
      g.save(); g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(60, 60, W - 120, H - 120); g.restore()
      const left = countdownLeft()
      text(String((left ? L.title : L.done) || '').toUpperCase(), W / 2, 230, { size: 46, weight: 700, font: 'cond', align: 'center', color: light ? '#2b2b2b' : '#f3e3c8', spacing: 18, shadow: light ? 0 : 14 })
      if (left) drawTimer(L.timer, { cx: W / 2, cy: H / 2 + 10, scale: L.timer === 'plain' ? 1.6 : 1.4, title: '', accent, light })
      const bottom = foot
      if (bottom) { const f = fitLine(bottom.toUpperCase(), W - 400, 48, 28, 700, 'cond'); text(f.str, W / 2, H - 170, { size: f.size, weight: 700, font: 'cond', align: 'center', color: ink, spacing: 6, shadow: light ? 0 : 12 }) }
      logoAt(W / 2 - 34, H - 140, 68, !light)
      return left
    }
    default: {
      // klasyczny: tło, ogłoszenia w środku, zegar u góry (na papierze — z falą)
      cdBackground(L, t)
      const pw = 1240, ph = 698, px = (W - pw) / 2, py = 330
      if (showText) bigText(L.sub, px, py + 200, pw, { size: 140, color: ink, align: 'center', shadowPx: light ? 0 : 20 })
      else annBox(t, px, py, pw, ph)
      if (L.bg === 'paper') topWave()
      return L.timer === 'plain' ? T(W / 2, 196, 0.72, L.bg === 'paper' ? false : light) : T(W / 2, 165, 1, L.bg === 'paper' ? false : light)
    }
  }
}

// Skała: wielki napis z lewej, ogłoszenia w poszarpanym panelu, zegar z kreskami po bokach, stopka.
function rockLayout(L, t, accent, foot, subText) {
  cdBackground(L, t, false)
  const onLight = LIGHT_BG.includes(L.bg), ink = L.ink || (onLight ? cleanInk(L.bg).ink : '#f4ecdf'), soft = L.ink || (onLight ? ink : '#fbe3bd')
  if (!onLight) shade()
  const left = countdownLeft(), ann = L.show !== 'text' && !!carousel(t), lx = 104, lw = 900
  if (L.brand) {
    logoAt(lx + 6, 62, 78)
    roughText(L.brand.toUpperCase(), lx + 118, 124, { size: 50, spacing: 5, color: ink })
    hairline(lx, 176, lw, ink)
  }
  const head = String((left ? L.title : L.done) || '').toUpperCase(), box = showBig(L), note = !box ? subText : ''
  // największy napis, przy którym nad zegarem zostaje miejsce
  let size = 232, lines = [], bottom = 0
  for (size of [232, 208, 180, 150, 124]) {
    lines = head ? wrap(head, lw, size, 400, 3, 'poster') : []
    bottom = 190 + (lines.length ? size + (lines.length - 1) * size * 1.03 : 0)
    if (bottom <= (note ? 690 : 750)) break
  }
  lines.forEach((l, i) => roughText(l, lx, 190 + size + i * size * 1.03, { size: Math.min(size, roughFit(l, lw, size)), color: ink }))
  // zegar zawsze z lewej, pod napisem, z wyraźnym odstępem — góra zostaje widoczna; podpis pod zegarem
  const clockY = Math.min(note ? 950 : 1006, bottom + 275), clockColor = onLight ? ink : accent
  if (note) { const f = fitLine(note, lw, 46, 28, 600); text(f.str, lx + 4, clockY + 64, { size: f.size, weight: 600, color: soft, shadow: onLight ? 0 : 14 }) }
  if (left) { if (L.timer === 'plain') roughClock(clockStr(left), lx, clockY, { size: 236, color: clockColor }); else drawTimer(L.timer, { cx: lx + 400, cy: clockY - 90, scale: 0.95, accent: clockColor, light: onLight }) }
  if (ann) {
    glassPanel(1066, 58, 758, 446)
    annBox(t, 1088, 80, 714, 402, 10)
  } else if (box) {
    const words = wrap(subBig(L), 760, 96, 700, 5, 'cond')
    words.forEach((l, i) => text(l, 1445, 300 + i * 104, { size: 96, weight: 700, font: 'cond', align: 'center', color: ink, shadow: onLight ? 0 : 20 }))
  }
  if (foot) { const up = foot.toUpperCase(); roughText(up, W - 60, H - 44, { size: roughFit(up, 900, 52, 30, 'cond', 2), font: 'cond', weight: 700, align: 'right', color: soft, spacing: 2 }) }
  return left
}
// Czysty: każde tło ma swoją kompozycję (Krem — podział, Piasek — napis u dołu, Czerń — środek).
function cleanClock(L, x, y, size, color, align: 'left' | 'center' | 'right', onLight) {
  const left = countdownLeft()
  if (!left) return
  const clock = clockStr(left)
  if (L.timer === 'plain') { steady((c, cx) => text(c, cx, y, { size, weight: 400, font: 'display', color, align: 'center' }), clock, x, size, 'display', 400, align); return }
  const w = 360
  drawTimer(L.timer, { cx: align === 'left' ? x + w : align === 'right' ? x - w : x, cy: y - size * 0.34, scale: 0.9, accent: L.accent || color, light: onLight })
}
function cleanTitle(lines, x, y, size, ink, align: 'left' | 'center' = 'left') { lines.forEach((l, i) => text(l, x, y + i * size * 1.05, { size, weight: 400, font: 'display', color: ink, align })) }
function cleanCard(t, x, y, w) { const h = w * 9 / 16, prev = setHalo(''); g.save(); rounded(x, y, w, h, 10); g.clip(); drawCarousel(carousel(t), x, y, w, h); g.restore(); setHalo(prev) }
function cleanLayout(L, t, foot, subText) {
  cdBackground(L, t, false)
  const ink = L.ink || cleanInk(L.bg).ink, accent = L.accent || '#f6a836', onLight = LIGHT_BG.includes(L.bg), left = countdownLeft(), ann = L.show !== 'text' && !!carousel(t)
  if (!onLight && L.bg !== 'czern') shade(0.5)
  const head = String((left ? L.title : L.done) || '')
  const textBox = L.show === 'text' && subText
  if (L.bg === 'czern') {
    logoAt(W / 2 - 46, 46, 92)
    const size = head.length > 24 ? 110 : 150, lines = wrap(head, 1560, size, 400, 2, 'display'), top = lines.length > 1 ? 240 : 270
    cleanTitle(lines, W / 2, top, size, ink, 'center')
    const y = top + (lines.length - 1) * size * 1.05 + 62
    const line = [foot, L.brand].filter(Boolean).join('   ·   ').toUpperCase()
    if (line) text(line, W / 2, y, { size: 36, weight: 700, font: 'sans', color: ink, align: 'center' })
    if (ann) { cleanCard(t, W / 2 - 300, y + 36, 600); cleanClock(L, W / 2, 1040, 118, accent, 'center', false) }
    else { if (subText) text(subText, W / 2, y + 66, { size: 40, weight: 700, font: 'sans', color: ink, align: 'center' }); cleanClock(L, W / 2, 900, 230, accent, 'center', false) }
    return left
  }
  if (L.bg === 'piasek') {
    logoAt(84, 64, 92)
    const size = head.length > 22 ? 150 : 200, lines = wrap(head, ann ? 1000 : 1500, size, 400, 3, 'display'), bottom = 880
    cleanTitle(lines, 84, bottom - (lines.length - 1) * size * 1.05, size, ink)
    if (subText) text(subText, 90, bottom + 62, { size: 36, weight: 700, font: 'sans', color: ink })
    let x = 90
    const row = 1010
    if (foot) { text(foot.toUpperCase(), x, row, { size: 36, weight: 700, font: 'sans', color: accent }); g.save(); g.font = fontStr(700, 36, 'sans'); x += g.measureText(foot.toUpperCase()).width + 34; g.restore() }
    if (foot && L.brand) { g.fillStyle = ink; g.fillRect(x, row - 30, 2, 42); x += 34 }
    if (L.brand) text(L.brand.toUpperCase(), x, row, { size: 36, weight: 700, font: 'sans', color: ink })
    cleanClock(L, W - 84, 214, 170, accent, 'right', true)
    if (ann) cleanCard(t, 1170, 300, 666)
    return left
  }
  // Krem (i inne tła): z lewej napis i zegar, z prawej blok z ogłoszeniem
  const lx = 96, lw = 940
  logoAt(lx, 64, 92)
  let px = lx + 130
  if (foot) px += pill(foot, px, 80, ink) + 16
  if (L.brand && px < 900) pill(L.brand, px, 80, ink)
  const size = head.length > 20 ? 136 : 170, lines = wrap(head, lw, size, 400, 3, 'display')
  cleanTitle(lines, lx, 360, size, ink)
  const y = 360 + (lines.length - 1) * size * 1.05
  if (subText && !textBox) text(subText, lx + 4, y + 74, { size: 38, weight: 700, font: 'sans', italic: true, color: ink })
  cleanClock(L, lx - 6, 990, 200, accent, 'left', onLight)
  if (ann) cleanCard(t, 1180, 150, 680)
  else if (textBox) wrap(subText, 620, 84, 400, 4, 'display').forEach((l, i) => text(l, 1210, 340 + i * 96, { size: 84, weight: 400, font: 'display', color: L.bg === 'krem' ? '#fbf3e6' : ink }))
  return left
}
const showBig = L => L.show === 'text' && !!L.sub
const subBig = L => fill(L.sub).toUpperCase()

// Miniatura układu z bieżącym wyglądem (do wyboru w Studio), 320×180.
export function layoutThumb(L, layout: string) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180
  const ctx = c.getContext('2d'); ctx.scale(320 / W, 180 / H)
  const prev = paintOn(ctx, { ...studio.preview, scene: 'countdown' })
  setDemo(true)
  try { drawCountdown({ ...L, layout }, 4000) } catch { /* bez miniatury */ } finally { setDemo(false); paintOn(prev.ctx, prev.look) }
  return c.toDataURL('image/jpeg', 0.82)
}
