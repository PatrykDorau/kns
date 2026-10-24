// Odliczanie: układy planszy i style zegara (wybierane w Studio → Odliczanie). Każdy układ rysuje tło,
// treść (ogłoszenia w pętli albo własny napis) i zegar w wybranym stylu; zwraca, ile sekund zostało.
import { servicePlace } from '@/stores'
import { H, W, studio } from './state'
import { fit, fitLine, fontStr, g, img, paintOn, rounded, text, wrap } from './paint'
import { carousel, cdBackground, countdownLeft, drawCarousel, paper, serviceCard, svcWhen, topWave, upcomingService } from './cards'
import { mediaSlide, mediaUrl } from './media'
import { BACKGROUNDS, LIGHT_BG } from './backgrounds'

export const LAYOUTS = [
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
type TimerOpt = { cx: number, cy: number, scale?: number, title?: string, accent: string, light: boolean }
export function drawTimer(style: string, o: TimerOpt) {
  const left = countdownLeft(), s = o.scale || 1, clock = left ? clockStr(left) : 'ZACZYNAMY'
  const title = left ? String(o.title || '').toUpperCase() : 'ZARAZ'
  const ink = o.light ? '#2b2b2b' : '#fff'
  if (style === 'bubble') {
    // dymek w kolorze akcentu, cyfry szeryfową kursywą (jak w zapowiedziach na plakatach)
    g.save(); g.font = fontStr(400, 170 * s, 'serif', true); const cw = g.measureText(clock).width; g.restore()
    const w = Math.max(460 * s, cw + 120 * s), h = 260 * s, x = o.cx - w / 2, y = o.cy - h / 2
    g.save(); g.translate(o.cx, o.cy); g.rotate(-0.025); g.translate(-o.cx, -o.cy)
    g.save(); shadow(34, 14); g.beginPath(); g.roundRect(x, y, w, h, 18 * s)
    g.moveTo(x + 60 * s, y + h - 2); g.lineTo(x + 56 * s, y + h + 70 * s); g.lineTo(x + 130 * s, y + h - 2)
    g.fillStyle = o.accent; g.fill(); g.restore()
    if (title) text(title, o.cx, y + 58 * s, { size: 30 * s, weight: 700, font: 'cond', align: 'center', color: 'rgba(255,255,255,0.85)', spacing: 6 * s })
    const f = fitLine(clock, w - 60 * s, 170 * s, 60 * s, 400, 'serif', true)
    text(f.str, o.cx, y + h - 50 * s, { size: f.size, weight: 400, font: 'serif', italic: true, align: 'center' })
    g.restore()
  } else if (style === 'pill') {
    // ciemna pigułka z obwódką: napis z lewej, cyfry z prawej
    g.save(); g.font = fontStr(700, 120 * s, 'cond'); const cw = g.measureText(clock).width; g.font = fontStr(700, 34 * s, 'cond'); const tw = title ? Math.min(260 * s, g.measureText(title).width) : 0; g.restore()
    const h = 170 * s, w = cw + tw + (title ? 150 : 100) * s, x = o.cx - w / 2, y = o.cy - h / 2
    g.save(); shadow(30, 10); rounded(x, y, w, h, h / 2); g.fillStyle = 'rgba(17,17,20,0.9)'; g.fill(); g.restore()
    g.save(); g.lineWidth = 5 * s; g.strokeStyle = o.accent; rounded(x + 8 * s, y + 8 * s, w - 16 * s, h - 16 * s, h / 2 - 8 * s); g.stroke(); g.restore()
    if (title) wrap(title, 260 * s, 34 * s, 700, 2, 'cond').forEach((l, i, a) => text(l, x + 60 * s, o.cy + (i - (a.length - 1) / 2) * 38 * s + 12 * s, { size: 34 * s, weight: 700, font: 'cond', color: '#f3e3c8', spacing: 2 * s }))
    text(clock, x + w - 50 * s, o.cy + 42 * s, { size: 120 * s, weight: 700, font: 'cond', color: o.accent, align: 'right' })
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
    if (title) text(title, o.cx, o.cy - 120 * s, { size: 40 * s, weight: 700, font: 'cond', align: 'center', color: o.light ? o.accent : '#f3e3c8', spacing: 10 * s, shadow: o.light ? 0 : 14 })
    const f = fitLine(clock, 1500 * s, 230 * s, 80, 700, 'cond')
    text(f.str, o.cx, o.cy + 90 * s, { size: f.size, weight: 700, font: 'cond', align: 'center', color: ink, shadow: o.light ? 0 : 30 })
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
    text(label.str, o.cx, o.cy - 46 * s, { size: left ? label.size : 30 * s, weight: 800, color: '#f3e3c8', align: 'center' })
    text(clock, o.cx, o.cy + (left ? 64 : 46) * s, { size: (left ? 112 : 64) * s, weight: 800, color: o.accent, align: 'center' })
  }
  return left
}

/* ---------- treść: ogłoszenia w pętli (albo karta nabożeństwa) w ramce ---------- */
function annBox(t, x, y, w, h, r = 18) {
  const c = carousel(t)
  g.save(); shadow(50, 18, 'rgba(40,30,20,0.35)'); rounded(x, y, w, h, r); g.fillStyle = '#fff'; g.fill(); g.restore()
  g.save(); rounded(x, y, w, h, r); g.clip()
  if (c) drawCarousel(c, x, y, w, h); else serviceCard(x, y, w, h)
  g.restore()
}
// napis jako treść (gdy wybrane „Napis” albo w układach bez ogłoszeń): duży, wąską czcionką, do 3 linii
function bigText(str, x, y, w, { size = 130, color = '#2b2b2b', align = 'left', lines = 3, shadowPx = 0 } = {}) {
  const ls = wrap(String(str || '').toUpperCase(), w, size, 700, lines, 'cond')
  ls.forEach((l, i) => text(l, align === 'center' ? x + w / 2 : x, y + i * size * 0.98, { size, weight: 700, font: 'cond', color, align, shadow: shadowPx }))
  return ls.length * size * 0.98
}
const nextLine = () => { const svc = upcomingService(); return svc ? svcWhen(svc) + ' · ' + servicePlace(svc) : '' }
function photo(L, x, y, w, h) {
  const it = L.image && mediaSlide(L.image), im = it?.type === 'image' && img(mediaUrl(it.path))
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip()
  if (im) fit(im, im.naturalWidth, im.naturalHeight, x, y, w, h, 'cover')
  else BACKGROUNDS.mountains(0)
  // ciepłe przyciemnienie, żeby zegar się wyróżniał
  const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, 'rgba(30,18,10,0.15)'); gr.addColorStop(1, 'rgba(30,18,10,0.55)')
  g.fillStyle = gr; g.fillRect(x, y, w, h)
  g.restore()
}
function logoAt(x, y, size, ring = true) {
  if (ring) { g.save(); shadow(20, 6, 'rgba(0,0,0,0.3)'); g.beginPath(); g.arc(x + size / 2, y + size / 2, size / 2 + size * 0.09, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore() }
  const lg = img('./znak-obrys.png'); if (lg) g.drawImage(lg, x, y, size, size)
}

/* ---------- układy ---------- */
export function drawCountdown(L, t) {
  const light = LIGHT_BG.includes(L.bg), accent = L.accent || '#f6a836', ink = light ? '#2b2b2b' : '#fff'
  const T = (cx, cy, scale = 1, light2 = light) => drawTimer(L.timer, { cx, cy, scale, title: L.title, accent, light: light2 })
  const showText = L.show === 'text' && L.sub
  switch (L.layout) {
    case 'center': {
      cdBackground(L, t)
      const left = T(W / 2, H / 2 - 40, L.timer === 'blob' ? 1.7 : 1.5)
      if (L.sub) { const s = fitLine(L.sub, W - 240, 56, 34, 700); text(s.str, W / 2, H / 2 + 300, { size: s.size, weight: 700, align: 'center', color: ink, shadow: light ? 0 : 18 }) }
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
      const nx = nextLine()
      if (nx) text(nx.toUpperCase(), rx + rw / 2, y + h - 50, { size: 30, weight: 700, font: 'cond', align: 'center', color: lightR ? '#5d5146' : '#f3e3c8', spacing: 4 })
      return T(x + lw * 0.72, y + 250, 0.95, false)
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
      text('KOŚCIÓŁ NA SKALE', 250, 172, { size: 34, weight: 700, font: 'cond', color: ink, spacing: 8, shadow: light ? 0 : 12 })
      g.fillStyle = accent; g.fillRect(120, 280, 120, 10)
      const left = countdownLeft()
      const head = left ? (L.title || 'Zaczynamy za') : 'Zaraz zaczynamy'
      const hl = wrap(head.toUpperCase(), 700, 120, 700, 2, 'cond')
      hl.forEach((l, i) => text(l, 116, 420 + i * 116, { size: 120, weight: 700, font: 'cond', color: ink, shadow: light ? 0 : 20 }))
      const ty = 420 + hl.length * 116 + 110
      if (left) {
        if (L.timer === 'plain' || L.timer === 'flip') text(clockStr(left), 112, ty + 70, { size: 230, weight: 700, font: 'cond', color: accent, shadow: light ? 0 : 24 })
        else drawTimer(L.timer, { cx: L.timer === 'pill' ? 380 : 400, cy: ty, scale: L.timer === 'pill' ? 1.3 : 0.95, title: '', accent, light })
      }
      const nx = nextLine()
      if (nx) text(nx.toUpperCase(), 120, H - 90, { size: 32, weight: 700, font: 'cond', color: light ? '#5d5146' : '#f3e3c8', spacing: 5 })
      return left
    }
    case 'bar': {
      // treść na cały ekran, u dołu ciemny pasek z napisem i zegarem
      const bh = 170
      if (showText) { cdBackground(L, t); bigText(L.sub, 120, (H - bh) / 2 - 40, W - 240, { size: 150, color: ink, align: 'center', lines: 3, shadowPx: light ? 0 : 20 }) }
      else { const c = carousel(t); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); if (c) drawCarousel(c, 0, 0, W, H - bh); else serviceCard(0, 0, W, H - bh) }
      const y = H - bh
      g.fillStyle = '#121214'; g.fillRect(0, y, W, bh)
      g.fillStyle = accent; g.fillRect(0, y, W, 6)
      logoAt(60, y + 38, 94)
      const left = countdownLeft()
      text((left ? L.title || 'Zaczynamy za' : 'Zaraz zaczynamy').toUpperCase(), 200, y + 108, { size: 54, weight: 700, font: 'cond', color: '#fff', spacing: 6 })
      const nx = nextLine()
      if (nx) text(nx.toUpperCase(), W / 2 + 120, y + 106, { size: 30, weight: 700, font: 'cond', color: '#a9a39b', spacing: 3, align: 'center' })
      if (left) text(clockStr(left), W - 70, y + 132, { size: 130, weight: 700, font: 'cond', color: accent, align: 'right' })
      // kropka „na żywo wkrótce” pulsuje
      g.save(); g.globalAlpha = 0.5 + 0.5 * Math.sin(t / 300); g.fillStyle = '#e5484d'; g.beginPath(); g.arc(W - 70 - (left >= 3600 ? 470 : 360), y + 88, 12, 0, Math.PI * 2); g.fill(); g.restore()
      return left
    }
    case 'minimal': {
      cdBackground(L, t, false)
      const line = light ? 'rgba(43,43,43,0.55)' : 'rgba(255,255,255,0.45)'
      g.save(); g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(60, 60, W - 120, H - 120); g.restore()
      const left = countdownLeft()
      text((left ? L.title || 'Zaczynamy za' : 'Zaraz zaczynamy').toUpperCase(), W / 2, 230, { size: 46, weight: 700, font: 'cond', align: 'center', color: light ? accent : '#f3e3c8', spacing: 18, shadow: light ? 0 : 14 })
      if (left) drawTimer(L.timer, { cx: W / 2, cy: H / 2 + 10, scale: L.timer === 'plain' ? 1.6 : 1.4, title: '', accent, light })
      const bottom = L.sub || nextLine()
      if (bottom) { const f = fitLine(bottom.toUpperCase(), W - 400, 38, 26, 700, 'cond'); text(f.str, W / 2, H - 170, { size: f.size, weight: 700, font: 'cond', align: 'center', color: ink, spacing: 6, shadow: light ? 0 : 12 }) }
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
      return T(W / 2, 165, 1, L.bg === 'paper' ? false : light)
    }
  }
}

// Miniatura układu z bieżącym wyglądem (do wyboru w Studio), 320×180.
export function layoutThumb(L, layout: string) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180
  const ctx = c.getContext('2d'); ctx.scale(320 / W, 180 / H)
  const prev = paintOn(ctx, { ...studio.preview, scene: 'countdown' })
  try { drawCountdown({ ...L, layout }, 4000) } catch { /* bez miniatury */ } finally { paintOn(prev.ctx, prev.look) }
  return c.toDataURL('image/jpeg', 0.82)
}
