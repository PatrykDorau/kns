// Sceny: co rysujemy na płótnie dla każdej sceny, napisy pieśni i pasek z mówcą.
import { nearestService, servicePlace } from '@/stores'
import { H, W, studio } from './state'
import { S, background, fitLine, g, img, rounded, text } from './paint'
import { CARD, armed, bankQr, carousel, cdBackground, cdLook, drawCarousel, paper, qr, serviceCard, setArmed, svcWhen, timerBlob, topWave, upcomingService, zeroAt } from './cards'
import { drawCamera } from './camera'
import { drawMedia, mediaOverlay, mediaSlide } from './media'
import { projectorFrame } from './projector'
import { toProgram } from './look'

let lyricShown = '', lyricPrev = '', lyricAt = 0
/* ---------- sceny ---------- */
export const SCENE_DRAW = {
  camera(t) { drawCamera(); mediaOverlay(); lowerThird(t); lyrics(t) },
  // „Zaraz zaczynamy” (wygląd w Studio → Scena): tło (papier z grafikami po bokach, ciemne, kolory, grafika),
  // zegar u góry z ogłoszeniami w pętli na środku — albo duży zegar na środku z napisem i podpisem.
  countdown(t) {
    const L = cdLook()
    cdBackground(L, t)
    let left
    if (L.layout === 'center') {
      left = timerBlob({ cy: H / 2 - 40, scale: 1.7, title: L.title })
      if (L.sub) { const s = fitLine(L.sub, W - 240, 56, 34, 700); text(s.str, W / 2, H / 2 + 300, { size: s.size, weight: 700, align: 'center', color: L.bg === 'paper' ? '#2b2b2b' : '#fff', shadow: L.bg === 'paper' ? 0 : 18 }) }
    } else {
      const c = carousel(t)
      const pw = 1240, ph = 698, px = (W - pw) / 2, py = 330
      g.save(); g.shadowColor = 'rgba(40,30,20,0.35)'; g.shadowBlur = 50; g.shadowOffsetY = 18
      rounded(px, py, pw, ph, 18); g.fillStyle = '#fff'; g.fill(); g.restore()
      g.save(); rounded(px, py, pw, ph, 18); g.clip()
      if (c) drawCarousel(c, px, py, pw, ph)
      else serviceCard(px, py, pw, ph)
      g.restore()
      if (L.bg === 'paper') topWave()
      left = timerBlob({ title: L.title })
    }
    // po zerze: 3 s „Zaraz zaczynamy”, potem sama Kamera (gdy zaznaczone)
    if (S !== studio.program) return
    if (left > 0) { setArmed(true) } else if (armed && studio.autoCamera) {
      if (!zeroAt) setArmed(true, t)
      if (t - zeroAt > 3000) { setArmed(false); studio.preview.scene = 'camera'; toProgram(p => { p.scene = 'camera' }) }
    }
  },
  announcements(t) {
    const c = carousel(t)
    if (!c) { paper(); text('Brak ogłoszeń — włącz je na liście pod podglądem', W / 2, H / 2, { size: 40, color: '#6b6258', align: 'center' }); return }
    drawCarousel(c, 0, 0, W, H)
  },
  // Koniec: logo, podziękowanie, najbliższe nabożeństwo i kafelki z kodami QR (wsparcie, YouTube, Spotify).
  end() {
    paper()
    g.fillStyle = 'rgba(38, 30, 22, 0.55)'; g.fillRect(0, 0, W, H) // przyciemnione tło
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 40; g.shadowOffsetY = 12
    rounded(CARD.x, CARD.y, CARD.w, CARD.h, 22); g.fillStyle = '#e6ddcf'; g.fill(); g.restore()
    const lg = img('./znak-obrys.png')
    if (lg) g.drawImage(lg, W / 2 - 85, 110, 170, 170)
    text('Dziękujemy, że byliście z nami!', W / 2, 375, { size: 80, weight: 800, color: '#d9862a', align: 'center' })
    const svc = upcomingService()
    if (svc) text('Do zobaczenia: ' + svcWhen(svc) + ' · ' + servicePlace(svc), W / 2, 445, { size: 38, weight: 600, color: '#2b2b2b', align: 'center' })
    const e = studio.end, bank = bankQr(e), phone = String(e.phone || '').replace(/[^\d+]/g, '').replace(/^(\+?48)?(\d{3})(\d{3})(\d{3})$/, '$2 $3 $4')
    const tiles = []
    if (bank || phone) tiles.push({ head: 'Wesprzyj kościół', qr: bank, lines: [bank && 'Zeskanuj w aplikacji banku', phone && 'albo BLIK na numer ' + phone].filter(Boolean) })
    if (e.youtube) tiles.push({ head: 'YouTube', qr: e.youtube, lines: ['Kazania i transmisje'] })
    if (e.spotify) tiles.push({ head: 'Spotify', qr: e.spotify, lines: ['Kazania jako podcast'] })
    if (!tiles.length) { text('Kościół Na Skale · kns-nabo.netlify.app', W / 2, 640, { size: 38, weight: 500, color: '#6b6258', align: 'center' }); return }
    const tw = 470, th = 440, gap = 60, x0 = (W - tiles.length * tw - (tiles.length - 1) * gap) / 2, y = 500
    tiles.forEach((tl, i) => {
      const x = x0 + i * (tw + gap)
      g.save(); g.shadowColor = 'rgba(40,30,20,0.18)'; g.shadowBlur = 30; g.shadowOffsetY = 8; rounded(x, y, tw, th, 22); g.fillStyle = '#f3eee6'; g.fill(); g.restore()
      g.fillStyle = '#f6a836'; rounded(x, y, tw, 8, 4); g.fill()
      text(tl.head, x + tw / 2, y + 66, { size: 40, weight: 800, color: '#2b2b2b', align: 'center' })
      if (tl.qr) qr(tl.qr, x + (tw - 250) / 2, y + 92, 250)
      else { tl.lines = []; text('Przelew BLIK na numer', x + tw / 2, y + 180, { size: 34, weight: 600, color: '#6b6258', align: 'center' }); text(phone, x + tw / 2, y + 265, { size: 64, weight: 800, color: '#e8952f', align: 'center' }); text('Dziękujemy za każde wsparcie!', x + tw / 2, y + 360, { size: 28, weight: 500, color: '#6b6258', align: 'center' }) }
      tl.lines.forEach((l, k) => text(l, x + tw / 2, y + (tl.qr ? 385 : 300) + k * 38, { size: k ? 30 : 27, weight: k ? 800 : 500, color: k ? '#2b2b2b' : '#6b6258', align: 'center' }))
    })
  },
  // Rzutnik — z kamerą w okienku, gdy włączona (wybrany róg, małe albo duże)
  projector(t) {
    projectorFrame(t)
    if (S.pip.on) {
      const w = S.pip.size === 'large' ? 800 : 512, h = w * 9 / 16, m = 48
      const x = S.pip.corner.includes('l') ? m : W - w - m, y = S.pip.corner.includes('t') ? m : H - h - m
      g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 40; rounded(x, y, w, h, 22); g.fillStyle = '#000'; g.fill(); g.restore()
      g.save(); rounded(x, y, w, h, 22); g.clip(); drawCamera(x, y, w, h); g.restore()
      g.save(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; rounded(x, y, w, h, 22); g.stroke(); g.restore()
    }
    mediaOverlay(); lowerThird(t); lyrics(t)
  },
  media(t) {
    const it = mediaSlide(S.media)
    if (!it) { background(t); text('Wybierz materiał w Bibliotece (pod podglądem)', W / 2, H / 2, { size: 40, color: '#8f98a8', align: 'center' }); return }
    drawMedia(it, true); lowerThird(t); lyrics(t)
  },
}
// Napisy pieśni: biały tekst, miękki cień, przenikanie przy zmianie zwrotki.
function lyrics(t) {
  if (!S.lyricsOn) return
  if (studio.lyrics !== lyricShown) { lyricPrev = lyricShown; lyricShown = studio.lyrics; lyricAt = t }
  const k = Math.min(1, (t - lyricAt) / 300)
  const draw = (str, alpha) => {
    if (!str || alpha <= 0) return
    const lines = str.split('\n').filter(l => l.trim())
    const size = lines.length > 4 ? 54 : 64, lh = size * 1.25
    lines.forEach((l, i) => text(l.trim(), W / 2, H - 90 - (lines.length - 1 - i) * lh, { size, weight: 700, align: 'center', alpha, shadow: 22 }))
  }
  draw(lyricPrev, 1 - k); draw(lyricShown, k)
}
// Pasek z mówcą i tytułem kazania (wjeżdża z lewej), z logo kościoła w białym kółku.
function lowerThird(t) {
  const svc = nearestService.value
  if (!svc || !(svc.speaker || svc.sermonTitle)) return
  // po wyłączeniu pasek wyjeżdża w lewo (pół sekundy)
  const off = !S.lowerThird
  if (off && !(S.lowerOff && t - S.lowerOff < 500)) return
  const k = off ? 1 - Math.min(1, (t - S.lowerOff) / 500) : Math.min(1, (t - S.lowerAt) / 500), e = 1 - Math.pow(1 - k, 3)
  const maxText = 1500 - 282
  const name = fitLine(svc.speaker || 'Kazanie', maxText, 46, 34, 800)
  const sub = fitLine([svc.sermonTitle, svc.passage].filter(Boolean).join(' · '), maxText, 32, 24, 500)
  g.save(); g.font = `800 ${name.size}px "Segoe UI", system-ui, sans-serif`; const w1 = g.measureText(name.str).width
  g.font = `500 ${sub.size}px "Segoe UI", system-ui, sans-serif`; const w2 = g.measureText(sub.str).width; g.restore()
  const w = Math.min(1500, Math.max(620, 222 + Math.max(w1, w2) + 60)), bh = 150
  const x = -w + (w + 60) * e, y = H - 250
  g.save(); g.globalAlpha = e
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30
  rounded(x, y, w, bh, 18); g.fillStyle = 'rgba(15,16,19,0.88)'; g.fill(); g.shadowBlur = 0
  g.fillStyle = '#f6a836'; g.fillRect(x + 18, y + bh - 6, w - 36, 6)
  // logo: białe kółko wystające nad pasek
  const cx = x + 100, cy = y + bh / 2, r = 92
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 24
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.shadowBlur = 0
  const lg = img('./znak-obrys.png')
  if (lg) g.drawImage(lg, cx - 72, cy - 72, 144, 144)
  g.restore()
  text(name.str, x + 222, y + 66, { size: name.size, weight: 800, alpha: e })
  text(sub.str, x + 222, y + 116, { size: sub.size, weight: 500, color: '#d6d8e0', alpha: e })
}
