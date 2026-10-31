// Sceny: co rysujemy na płótnie dla każdej sceny, napisy pieśni i pasek z mówcą.
import { ANN_MEDIA, H, W, studio } from './state'
import { S, background, fitLine, fontStr, fullImage, g, img, paintOn, rounded, setHalo, text, wrap } from './paint'
import { CARD, armed, bankQr, bannerNow, fill, lowerLookOf, prayerLook, presetBanners, setDemo, carousel, cdBackground, cdLook, drawCarousel, endLook, paper, qr, setArmed, zeroAt } from './cards'
import { bottomBand, glassPanel, hairline, roughFit, roughText, shade } from './rough'
import { cleanInk, pill } from './clean'
import { drawLife } from './life'
import { drawCountdown } from './countdown'
import { LIGHT_BG } from './backgrounds'
import { drawCamera } from './camera'
import { drawMedia, drawSlideOf, mediaOverlay, mediaSlide, mediaUrl } from './media'
import { projectorFrame } from './projector'
import { toProgram } from './look'
import type { Look } from '@/types'

let lyricShown = '', lyricPrev = '', lyricAt = 0, lyricSeen = 0
/* ---------- sceny ---------- */
export const SCENE_DRAW = {
  camera(t) { drawCamera(); mediaOverlay(); prayerOverlay(); endOverlay(); lowerThird(t); lyrics(t) },
  // „Zaraz zaczynamy”: układ, styl zegara, tło i treść — w Studio → Odliczanie (countdown.ts)
  countdown(t) {
    const left = drawCountdown(cdLook(), t)
    cameraPip()
    // po zerze: 3 s „Zaraz zaczynamy”, potem sama Kamera (gdy zaznaczone)
    if (S !== studio.program) return
    if (left > 0) { setArmed(true) } else if (armed && studio.autoCamera) {
      if (!zeroAt) setArmed(true, t)
      if (t - zeroAt > 3000) { setArmed(false); studio.preview.scene = 'camera'; toProgram(p => { p.scene = 'camera' }) }
    }
  },
  // Koniec: tło (jak w odliczaniu), podziękowanie, najbliższe nabożeństwo i kody QR (wsparcie, YouTube, Spotify)
  // w jednym z układów: karta z kafelkami, napis obok kodów albo duży napis z kodami u dołu.
  end(t) {
    const L = endLook(), light = LIGHT_BG.includes(L.bg)
    // sama grafika z Biblioteki (rozmyte tło z tej samej grafiki + grafika w całości)
    if (L.layout === 'image') {
      const it = L.pic && mediaSlide(L.pic), im = it?.type === 'image' && img(mediaUrl(it.path))
      if (im) fullImage(im)
      else { paper(); text(it ? 'Wczytuję grafikę…' : 'Wybierz grafikę w ustawieniach sceny Koniec', W / 2, H / 2, { size: 40, color: '#6b6258', align: 'center' }) }
      cameraPip(); return
    }
    cdBackground(L, t, L.layout !== 'cards')
    if (L.layout === 'rock') { endRock(L); cameraPip(); return }
    if (L.layout === 'edit') { endClean(L); cameraPip(); return }
    const prev = setHalo(light && L.layout !== 'cards' ? 'rgba(244,237,227,0.92)' : '')
    try { if (L.layout === 'side') endSide(L, light); else if (L.layout === 'center') endCenter(L, light); else endCards(L) } finally { setHalo(prev) }
    cameraPip()
  },
  // Życie kościoła: kamera w ramce z ogłoszeniami, wydarzeniami i kodem QR
  life(t) { drawLife(t, L => bannerQrs(L), (q, x, y, size, label) => qrTile(q, x, y, size, label), logo); lowerThird(t); lyrics(t) },
  // Rzutnik — z kamerą w okienku, gdy włączona (wybrany róg, małe albo duże)
  projector(t) {
    projectorFrame(t)
    cameraPip()
    mediaOverlay(); prayerOverlay(); endOverlay(); lowerThird(t); lyrics(t)
  },
  media(t) {
    if (S.media === ANN_MEDIA) {
      const c = carousel(t)
      if (c) drawCarousel(c, 0, 0, W, H)
      else { paper(); text('Brak ogłoszeń — włącz je w zakładce „Ogłoszenia”', W / 2, H / 2, { size: 40, color: '#6b6258', align: 'center' }) }
      cameraPip(); prayerOverlay(); lowerThird(t); lyrics(t); return
    }
    const it = mediaSlide(S.media)
    if (!it) { background(t); text('Wybierz materiał w Bibliotece (pod podglądem)', W / 2, H / 2, { size: 40, color: '#8f98a8', align: 'center' }); return }
    drawSlideOf(S.media, x => drawMedia(x, true)); cameraPip(); prayerOverlay(); lowerThird(t); lyrics(t)
  },
}
// Preset na osobnym płótnie (miniatura, podgląd w Przygotowaniu): plansza z jego wyglądem, nakładka na neutralnym tle.
export function drawPreset(ctx, kind, data, t, edit = false) {
  const look = { ...studio.preview, loop: edit, pip: { ...studio.preview.pip, on: false }, ovl: 'off', lyricsOn: false, lowerOff: 0, styles: { cd: data, end: data, life: data },
    scene: kind === 'cd' ? 'countdown' : kind === 'end' ? 'end' : kind === 'life' ? 'life' : 'camera', prayer: kind === 'prayer', prayerLook: kind === 'prayer' ? data : null,
    lowerAt: 0, lowerThird: kind === 'lower', lowerLook: kind === 'lower' ? data : null,
    endOvl: kind === 'banner', banner: kind === 'banner' ? { list: presetBanners(data, edit).slice(0, 1), sec: 10, at: 0 } : null }
  const prev = paintOn(ctx, look as Look)
  setDemo(true)
  try {
    if (kind === 'cd') SCENE_DRAW.countdown(t); else if (kind === 'end') SCENE_DRAW.end(t)
    else if (kind === 'life') drawLife(t, L => bannerQrs(L), (q, x, y, size, label) => qrTile(q, x, y, size, label), logo, true)
    else { cdBackground({ bg: 'szczyt', draw: false, dim: 0 }, t); endOverlay(); prayerOverlay(); lowerThird(t) }
  } finally { setDemo(false); paintOn(prev.ctx, prev.look) }
}
// Kamera w okienku (nakładka na każdej scenie poza Kamerą): wybrany róg, małe albo duże.
function cameraPip() {
  if (!S.pip.on || S.scene === 'camera') return
  const w = S.pip.size === 'large' ? 800 : 512, h = w * 9 / 16, m = 48
  const x = S.pip.corner.includes('l') ? m : W - w - m, y = S.pip.corner.includes('t') ? m : H - h - m
  g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 40; rounded(x, y, w, h, 22); g.fillStyle = '#000'; g.fill(); g.restore()
  g.save(); rounded(x, y, w, h, 22); g.clip(); drawCamera(x, y, w, h); g.restore()
  g.save(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; rounded(x, y, w, h, 22); g.stroke(); g.restore()
}
/* ---------- Koniec: kafelki i układy ---------- */
function endTiles() {
  const e = studio.end, bank = bankQr(e), phone = String(e.phone || '').replace(/[^\d+]/g, '').replace(/^(\+?48)?(\d{3})(\d{3})(\d{3})$/, '$2 $3 $4')
  const tiles = []
  if (bank || phone) tiles.push({ head: 'Wesprzyj kościół', qr: bank, phone, lines: [bank && 'Zeskanuj w aplikacji banku', phone && 'albo BLIK na numer ' + phone].filter(Boolean) })
  if (e.youtube) tiles.push({ head: 'YouTube', qr: e.youtube, lines: ['Kazania i transmisje'] })
  if (e.spotify) tiles.push({ head: 'Spotify', qr: e.spotify, lines: ['Kazania jako podcast'] })
  return tiles
}
// Koniec „Czysty”: logo, elegancki napis, kody QR bez ramek.
function endClean(L) {
  const onLight = LIGHT_BG.includes(L.bg), { ink: autoInk, accent: autoAccent = '#f6a836' } = cleanInk(L.bg) as { ink: string, accent?: string }, ink = L.ink || autoInk, accent = L.ink || autoAccent, lx = 96, tiles = endTiles(), side = L.bg === 'krem' ? '#fbf3e6' : ink, lw = tiles.length ? 1000 : 1500
  if (!onLight && L.bg !== 'czern') shade(0.6, 0.8)
  logo(lx, 64, 92)
  if (L.brand) pill(L.brand, lx + 130, 74, ink)
  const lines = wrap(String(L.title || ''), tiles.length ? 960 : lw, 130, 400, 4, 'display')
  lines.forEach((l, i) => text(l, lx, 370 + i * 140, { size: 130, weight: 400, font: 'display', color: ink }))
  const sub = fill(L.sub)
  if (sub) { const f = fitLine(sub, lw, 42, 26, 700, 'sans'); text(f.str, lx + 4, 980, { size: f.size, weight: 700, font: 'sans', color: onLight ? accent : ink }) }
  const q = 250, gap = 40, total = tiles.length * q + (tiles.length - 1) * gap, x = W - 110 - q
  let y = (H - total) / 2
  for (const tl of tiles) {
    if (tl.qr) { rounded(x, y, q, q, 10); g.fillStyle = '#fff'; g.fill(); qr(tl.qr, x + 14, y + 14, q - 28) }
    text(tl.head, x - 28, y + q / 2 - (tl.qr ? 4 : 20), { size: 40, weight: 400, font: 'display', color: side, align: 'right' })
    if (tl.lines[0]) { const f = fitLine(tl.lines[0], 400, 24, 18, 700, 'sans'); text(f.str, x - 28, y + q / 2 + 36, { size: f.size, weight: 700, font: 'sans', color: L.bg === 'krem' ? side : accent, align: 'right' }) }
    y += q + gap
  }
}
// Koniec „Skała”: wielki napis z lewej, kody QR w poszarpanym panelu z prawej.
function endRock(L) {
  const onLight = LIGHT_BG.includes(L.bg), ink = L.ink || (onLight ? cleanInk(L.bg).ink : '#f4ecdf')
  if (!onLight) shade()
  const lx = 104, lw = 900
  if (L.brand) {
    logo(lx + 6, 62, 78, true)
    roughText(L.brand.toUpperCase(), lx + 118, 124, { size: 50, spacing: 5, color: ink })
    hairline(lx, 176, lw, ink)
  }
  const head = String(L.title || '').toUpperCase(), lines = wrap(head, lw, 176, 400, 4, 'poster')
  lines.forEach((l, i) => roughText(l, lx, 360 + i * 182, { size: Math.min(176, roughFit(l, lw, 176)), color: ink }))
  const sub = fill(L.sub)
  if (sub) wrap(sub, lw, 44, 600, 2).forEach((l, i) => text(l, lx + 4, 360 + (lines.length - 1) * 182 + 86 + i * 56, { size: 44, weight: 600, color: L.ink || (onLight ? ink : '#fbe3bd'), shadow: onLight ? 0 : 14 }))
  const tiles = endTiles()
  if (!tiles.length) return
  const tw = 700, th = 268, gap = 26, x = W - tw - 90, total = tiles.length * th + (tiles.length - 1) * gap
  let y = (H - total) / 2
  glassPanel(x - 36, y - 36, tw + 72, total + 72)
  for (const tl of tiles) {
    if (tl.qr) { rounded(x, y, th, th, 10); g.fillStyle = '#fff'; g.fill(); qr(tl.qr, x + 14, y + 14, th - 28) }
    const tx = tl.qr ? x + th + 34 : x + 10, mid = y + th / 2
    roughText(tl.head.toUpperCase(), tx, mid - 18, { size: roughFit(tl.head.toUpperCase(), x + tw - tx, 64, 36), color: '#f6a836' })
    if (tl.qr) tl.lines.forEach((l, k) => { const f = fitLine(l, x + tw - tx, 30, 20, 500); text(f.str, tx, mid + 32 + k * 40, { size: f.size, weight: k ? 700 : 500, color: '#f4ecdf' }) })
    else { text('BLIK na numer', tx, mid + 26, { size: 32, weight: 600, color: '#f4ecdf' }); roughText(tl.phone, tx, mid + 100, { size: 70, color: '#f6a836' }) }
    y += th + gap
  }
}
function logo(x, y, size, ring = false) {
  if (ring) { g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 30; g.beginPath(); g.arc(x + size / 2, y + size / 2, size / 2 + 14, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore() }
  const lg = img('./znak-obrys.png'); if (lg) g.drawImage(lg, x, y, size, size)
}
function tileCard(x, y, tw, th) {
  g.save(); g.shadowColor = 'rgba(20,15,10,0.25)'; g.shadowBlur = 30; g.shadowOffsetY = 8; rounded(x, y, tw, th, 22); g.fillStyle = '#f3eee6'; g.fill(); g.restore()
  g.fillStyle = '#f6a836'; rounded(x, y, tw, 8, 4); g.fill()
}
// karta na środku (jak grafiki ogłoszeń), kafelki obok siebie
function endCards(L) {
  g.fillStyle = L.bg === 'paper' ? 'rgba(38, 30, 22, 0.55)' : 'rgba(0, 0, 0, 0.3)'; g.fillRect(0, 0, W, H) // przyciemnione tło
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 40; g.shadowOffsetY = 12
  rounded(CARD.x, CARD.y, CARD.w, CARD.h, 22); g.fillStyle = '#e6ddcf'; g.fill(); g.restore()
  logo(W / 2 - 85, 110, 170)
  const t = fitLine(L.title || '', CARD.w - 120, 80, 50, 800)
  text(t.str, W / 2, 375, { size: t.size, weight: 800, color: L.ink || '#d9862a', align: 'center' })
  const nx = fill(L.sub)
  if (nx) { const n = fitLine(nx, CARD.w - 120, 38, 26, 600); text(n.str, W / 2, 445, { size: n.size, weight: 600, color: L.ink || '#2b2b2b', align: 'center' }) }
  const tiles = endTiles()
  if (!tiles.length) return
  const tw = 470, th = 440, gap = 60, x0 = (W - tiles.length * tw - (tiles.length - 1) * gap) / 2, y = 500
  tiles.forEach((tl, i) => {
    const x = x0 + i * (tw + gap)
    tileCard(x, y, tw, th)
    text(tl.head, x + tw / 2, y + 66, { size: 40, weight: 800, color: '#2b2b2b', align: 'center' })
    if (tl.qr) { qr(tl.qr, x + (tw - 250) / 2, y + 92, 250); tl.lines.forEach((l, k) => text(l, x + tw / 2, y + 385 + k * 38, { size: k ? 30 : 27, weight: k ? 800 : 500, color: k ? '#2b2b2b' : '#6b6258', align: 'center' })) }
    else { text('Przelew BLIK na numer', x + tw / 2, y + 180, { size: 34, weight: 600, color: '#6b6258', align: 'center' }); text(tl.phone, x + tw / 2, y + 265, { size: 64, weight: 800, color: '#e8952f', align: 'center' }); text('Dziękujemy za każde wsparcie!', x + tw / 2, y + 360, { size: 28, weight: 500, color: '#6b6258', align: 'center' }) }
  })
}
// po lewej logo, podziękowanie i najbliższe nabożeństwo; po prawej kody QR jeden pod drugim
function endSide(L, light) {
  const soft = L.ink || (light ? '#5d5146' : '#efe6da'), sh = light ? 0 : 20
  logo(150, 150, 200, !light)
  const lines = wrap(L.title || '', 860, 92, 800, 3)
  lines.forEach((l, i) => text(l, 140, 500 + i * 108, { size: 92, weight: 800, color: L.ink || (light ? '#d9862a' : '#f6a836'), shadow: sh }))
  let y = 500 + (lines.length - 1) * 108 + 90
  for (const l of [fill(L.sub)].filter(Boolean)) { wrap(l, 860, 40, 600, 2).forEach(x => { text(x, 140, y, { size: 40, weight: 600, color: soft, shadow: sh }); y += 54 }); y += 14 }
  const tiles = endTiles()
  if (!tiles.length) return
  const tw = 720, gap = 30, th = Math.min(290, (H - 160 - (tiles.length - 1) * gap) / tiles.length), x = W - tw - 110
  let ty = (H - (tiles.length * th + (tiles.length - 1) * gap)) / 2
  for (const tl of tiles) {
    tileCard(x, ty, tw, th)
    const q = th - 56
    if (tl.qr) qr(tl.qr, x + 28, ty + 32, q)
    const tx = tl.qr ? x + q + 64 : x + 40, mid = ty + th / 2
    text(tl.head, tx, mid - 30, { size: 44, weight: 800, color: '#2b2b2b' })
    if (tl.qr) tl.lines.forEach((l, k) => { const f = fitLine(l, x + tw - tx - 30, k ? 32 : 30, 22, k ? 800 : 500); text(f.str, tx, mid + 26 + k * 46, { size: f.size, weight: k ? 800 : 500, color: k ? '#e8952f' : '#6b6258' }) })
    else { text('BLIK na numer', tx, mid + 22, { size: 32, weight: 600, color: '#6b6258' }); text(tl.phone, tx, mid + 96, { size: 64, weight: 800, color: '#e8952f' }) }
    ty += th + gap
  }
}
// Baner (nakładka na Kamerze i Rzutniku): obraz zostaje, u dołu napis i kod QR — w ramce, w pasku
// albo w karcie w rogu; kolor, napisy, dopisek i kod QR ustawia się w „Nakładkach”.
// Czas modlitwy: obraz zostaje, u dołu spokojny napis (rozstrzelone „CZAS MODLITWY”, napis kursywą, podpis).
function prayerOverlay() {
  if (!S.prayer) return
  const P = prayerLook(), txt = P.text || '', sub = P.sub || '', label = P.head || '', link = String(P.link || '').trim(), h = 300, y = H - h
  if (!txt && !sub && !label && !link) return
  const tw = link ? W - 640 : W - 300 // z kodem QR po prawej napisy węższe
  const clean = P.style === 'edit', ink = P.ink || (clean ? '#1a2a9a' : '#fff')
  if (clean) { g.fillStyle = '#fbf3e6'; g.fillRect(0, y, W, h); g.fillStyle = ink; g.fillRect(0, y, W, 4) }
  else bottomBand(y)
  const ly = y + (sub ? 92 : 112)
  g.save(); g.font = fontStr(700, 32, 'cond'); g.letterSpacing = '14px'; const lw = g.measureText(label).width; g.restore()
  text(label, W / 2 + 7, ly, { size: 32, weight: 700, font: 'cond', color: clean || P.ink ? ink : '#f6c27a', align: 'center', spacing: 14 })
  if (label) { g.fillStyle = clean || P.ink ? ink : 'rgba(246,194,122,0.7)'; g.fillRect(W / 2 - lw / 2 - 150, ly - 11, 110, 2); g.fillRect(W / 2 + lw / 2 + 40, ly - 11, 110, 2) }
  const f = fitLine(txt, tw, 78, 44, 400, 'serif', true)
  text(f.str, W / 2, ly + 96, { size: f.size, weight: 400, font: clean ? 'display' : 'serif', italic: true, align: 'center', shadow: clean ? 0 : 24, color: ink })
  if (sub) { const s = fitLine(sub, tw - 100, 34, 24, 500); text(s.str, W / 2, ly + 160, { size: s.size, weight: 500, color: clean || P.ink ? ink : '#e9e1d6', align: 'center', shadow: clean ? 0 : 16 }) }
  // kod QR do strony z prośbami modlitewnymi (gdy podany link)
  if (link) { const q = 190, qx = W - q - 90, qy = H - q - 74; qrTile({ qr: link, head: '' }, qx, qy, q, P.label) }
}
function bannerQrs(B) {
  const tiles = endTiles(), pick = h => tiles.filter(x => x.head === h)
  if (B.qr === 'bank') return pick('Wesprzyj kościół')
  if (B.qr === 'youtube') return pick('YouTube')
  if (B.qr === 'spotify') return pick('Spotify')
  if (B.qr === 'link') return B.link ? [{ head: 'Link', qr: B.link, lines: [String(B.link).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')] }] : []
  if (B.qr === 'none') return []
  return tiles
}
const autoNote = q => !q ? '' : q.head === 'Wesprzyj kościół' ? (q.qr ? 'Zeskanuj kod w aplikacji banku' + (q.phone ? ' · BLIK ' + q.phone : '') : '') : q.lines[0] || ''
function qrTile(q, x, y, size, label = '') {
  if (q.qr) { g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18; rounded(x, y, size, size, 12); g.fillStyle = '#fff'; g.fill(); g.restore(); qr(q.qr, x + 7, y + 7, size - 14) }
  else { rounded(x, y, size, size, 12); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill(); text('BLIK', x + size / 2, y + size * 0.42, { size: size * 0.18, weight: 700, font: 'cond', color: '#f3e3c8', align: 'center' }); const p = fitLine(q.phone, size - 16, size * 0.22, 18, 700, 'cond'); text(p.str, x + size / 2, y + size * 0.72, { size: p.size, weight: 700, font: 'cond', color: '#fff', align: 'center' }) }
  if (label) { const f = fitLine(label, size + 20, 26, 18, 700, 'cond'); text(f.str.toUpperCase(), x + size / 2, y + size + 34, { size: f.size, weight: 700, font: 'cond', color: '#fff', align: 'center', spacing: 2, shadow: 10 }) }
}
// baner albo kolejka banerów — kolejny wchodzi płynnie (0,6 s przenikania)
function endOverlay() {
  if (!S.endOvl) return
  const { list, sec, at = 0 } = bannerNow()
  if (list.length < 2) { drawBanner(list[0]); return }
  const t = performance.now() - at, slot = sec * 1000, i = Math.floor(t / slot) % list.length, k = t < slot ? 1 : Math.min(1, (t % slot) / 600)
  if (k < 1) drawBanner(list[(i - 1 + list.length) % list.length]) // poprzedni stoi pod spodem, nowy wchodzi na niego — pas nie prześwituje
  g.save(); g.globalAlpha = k; drawBanner(list[i]); g.restore()
}
function drawBanner(B) {
  if (!B) return
  const qs = bannerQrs(B), color = B.color || '#f6a836'
  const title = String(B.title || ''), sub = fill(B.sub), note = fill(String(B.note || '').split('{opis kodu}').join(qs.length === 1 && B.style !== 'card' ? autoNote(qs[0]) : ''))
  if (!title && !sub && !note && !qs.length) return
  if (B.style === 'edit') {
    // czysty pas u dołu: kremowy, elegancki napis, kody QR po prawej
    const bh = 250, y = H - bh, tw = 180, gap = 22, ink = B.ink || '#1a2a9a', qrW = qs.length * tw + Math.max(0, qs.length - 1) * gap, tx0 = W - 70 - qrW
    g.fillStyle = '#fbf3e6'; g.fillRect(0, y, W, bh); g.fillStyle = color; g.fillRect(0, y, W, 6)
    logo(70, y + 72, 110)
    const maxT = tx0 - 300, t = fitLine(title, maxT, 92, 48, 400, 'display')
    text(t.str, 220, y + (sub || note ? 118 : 144), { size: t.size, weight: 400, font: 'display', color: ink })
    let ly = y + 176
    for (const l of [sub, note].filter(Boolean)) { const f = fitLine(l, maxT, 30, 20, 700, 'sans'); text(f.str, 222, ly, { size: f.size, weight: 700, font: 'sans', color: ink }); ly += 40 }
    qs.forEach((q, i) => { if (q.qr) qr(q.qr, tx0 + i * (tw + gap), y + 34, tw); else text(q.phone, tx0 + i * (tw + gap) + tw / 2, y + 130, { size: 38, weight: 700, font: 'sans', color: ink, align: 'center' }) })
    return
  }
  if (B.style === 'rock') {
    // poszarpany pas u dołu: logo, wielki napis, kody QR po prawej
    const bh = 280, y = H - bh, tw = 190, gap = 24, qrW = qs.length * tw + Math.max(0, qs.length - 1) * gap, tx0 = W - 70 - qrW
    bottomBand(y, 'rgba(16,10,6,0.92)', color)
    logo(70, y + 60, 130, true)
    // długi tytuł schodzi na dwie linie, żeby nie wejść pod kody QR
    const maxT = tx0 - 320, big = title.toUpperCase(), fits = roughFit(big, maxT, 104, 56), two = big && fits <= 56, heads = two ? wrap(big, maxT, 62, 400, 2, 'poster') : [big]
    heads.forEach((l, i) => roughText(l, 260, y + (two ? 92 + i * 66 : sub || note ? 124 : 164), { size: two ? Math.min(62, roughFit(l, maxT, 62, 30)) : fits, color: B.ink || color }))
    let ly = y + (two ? 212 : 186)
    for (const l of [sub, note].filter(Boolean)) { const f = fitLine(l, maxT, 36, 24, 600); text(f.str, 262, ly, { size: f.size, weight: 600, color: B.ink || '#f4ecdf', shadow: 10 }); ly += 46 }
    qs.forEach((q, i) => qrTile(q, tx0 + i * (tw + gap), y + 26, tw - 10, q.head === 'Wesprzyj kościół' ? 'Wsparcie' : q.head))
    return
  }
  if (B.style === 'card') {
    // karta w prawym dolnym rogu
    const w = 820, h = 300, x = W - w - 60, y = H - h - 60, q = qs[0], qw = q ? 230 : 0, tw = w - qw - (q ? 110 : 80)
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 40; g.shadowOffsetY = 12; rounded(x, y, w, h, 24); g.fillStyle = '#f7f2ea'; g.fill(); g.restore()
    g.save(); rounded(x, y, w, h, 24); g.clip(); g.fillStyle = color; g.fillRect(x, y, 14, h); g.restore()
    const tl = wrap(title.toUpperCase(), tw, 64, 700, 2, 'cond')
    tl.forEach((l, i) => text(l, x + 50, y + 92 + i * 64, { size: 64, weight: 700, font: 'cond', color: B.ink || '#221c16' }))
    let ly = y + 92 + (tl.length - 1) * 64 + 54
    if (sub) { const f = fitLine(sub, tw, 32, 22, 600); text(f.str, x + 50, ly, { size: f.size, weight: 600, color: B.ink || '#6b5d50' }); ly += 44 }
    if (note) wrap(note, tw, 26, 500, 2).forEach(l => { text(l, x + 50, ly, { size: 26, weight: 500, color: '#8a7b6c' }); ly += 34 })
    if (q) { if (q.qr) qr(q.qr, x + w - qw - 35, y + (h - qw) / 2, qw); else { text('BLIK', x + w - 150, y + 130, { size: 40, weight: 700, font: 'cond', color: '#6b5d50', align: 'center' }); text(q.phone, x + w - 150, y + 190, { size: 46, weight: 700, font: 'cond', color, align: 'center' }) } }
    return
  }
  if (B.style === 'band') {
    // ciemny pasek przechodzący w przezroczystość, logo, napis, kody QR po prawej
    const bh = 330, y = H - bh
    const gr = g.createLinearGradient(0, y - 160, 0, H); gr.addColorStop(0, 'rgba(10,10,12,0)'); gr.addColorStop(0.35, 'rgba(10,10,12,0.72)'); gr.addColorStop(1, 'rgba(10,10,12,0.9)')
    g.fillStyle = gr; g.fillRect(0, y - 160, W, bh + 160)
    g.fillStyle = color; g.fillRect(0, H - 8, W, 8)
    const tw = 190, gap = 26, qrW = qs.length * tw + Math.max(0, qs.length - 1) * gap, tx0 = W - 80 - qrW
    logo(80, y + 60, 150, true)
    const maxT = tx0 - 330 - 60
    const t = fitLine(title, maxT, 72, 44, 800)
    text(t.str, 300, y + 128, { size: t.size, weight: 800, color: B.ink || '#fff', shadow: 20 })
    let ly = y + 190
    for (const l of [sub, note].filter(Boolean)) { const f = fitLine(l, maxT, 36, 24, 600); text(f.str, 300, ly, { size: f.size, weight: 600, color: B.ink || '#f3e3c8', shadow: 14 }); ly += 48 }
    qs.forEach((q, i) => qrTile(q, tx0 + i * (tw + gap), y + 40, tw, q.head === 'Wesprzyj kościół' ? 'Wsparcie' : q.head))
    return
  }
  // ramka: zaokrąglony baner w kolorze, duży napis wąską czcionką, z prawej dopisek i kod QR
  const m = 40, h = 240, x = m, y = H - h - m, w = W - 2 * m
  g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30; rounded(x, y, w, h, 30); g.fillStyle = 'rgba(16,14,12,0.84)'; g.fill(); g.restore()
  g.save(); g.lineWidth = 8; g.strokeStyle = color; rounded(x + 4, y + 4, w - 8, h - 8, 27); g.stroke(); g.restore()
  const many = qs.length > 1, qsz = many ? 160 : 186, qgap = 34
  const qrW = qs.length ? qs.length * qsz + (qs.length - 1) * qgap : 0
  let rx = x + w - 44 - qrW
  if (many) qs.forEach((q, i) => qrTile(q, rx + i * (qsz + qgap), y + 22, qsz, q.head === 'Wesprzyj kościół' ? 'Wsparcie' : q.head))
  else if (qs[0]) qrTile(qs[0], rx, y + (h - qsz) / 2, qsz)
  let noteW = 0
  if (note && !many) {
    noteW = 420
    const nl = wrap(note.toUpperCase(), noteW, 30, 700, 4, 'cond')
    nl.forEach((l, i) => text(l, rx - 34, y + h / 2 - (nl.length - 1) * 17 + i * 34 + 10, { size: 30, weight: 700, font: 'cond', color: color, align: 'right' }))
  }
  const maxT = rx - (noteW ? noteW + 70 : 50) - (x + 60)
  const t = fitLine(title.toUpperCase(), maxT, 112, 56, 700, 'cond')
  text(t.str, x + 60, y + (sub ? 128 : 150), { size: t.size, weight: 700, font: 'cond', color: B.ink || color })
  if (sub) { const f = fitLine(sub.toUpperCase(), maxT, 54, 32, 700, 'cond'); text(f.str, x + 62, y + 196, { size: f.size, weight: 700, font: 'cond', color: B.ink || '#fff' }) }
}
// duży napis na środku, pod nim nabożeństwo; kody QR małe, w pasku u dołu
function endCenter(L, light) {
  const sh = light ? 0 : 24, tiles = endTiles(), top = tiles.length ? 90 : 200
  logo(W / 2 - 90, top, 180, !light)
  const lines = wrap(L.title || '', W - 300, 104, 800, 2)
  lines.forEach((l, i) => text(l, W / 2, top + 330 + i * 120, { size: 104, weight: 800, color: L.ink || (light ? '#d9862a' : '#fff'), align: 'center', shadow: sh }))
  let y = top + 330 + (lines.length - 1) * 120 + 80
  for (const l of [fill(L.sub)].filter(Boolean)) { const f = fitLine(l, W - 300, 42, 28, 600); text(f.str, W / 2, y, { size: f.size, weight: 600, color: L.ink || (light ? '#5d5146' : '#f3e3c8'), align: 'center', shadow: sh }); y += 58 }
  if (!tiles.length) return
  const tw = 440, th = 230, gap = 40, x0 = (W - tiles.length * tw - (tiles.length - 1) * gap) / 2, ty = H - th - 60
  tiles.forEach((tl, i) => {
    const x = x0 + i * (tw + gap)
    tileCard(x, ty, tw, th)
    if (tl.qr) { qr(tl.qr, x + 24, ty + 30, 176); const hd = fitLine(tl.head, tw - 244, 32, 22, 800); text(hd.str, x + 222, ty + 100, { size: hd.size, weight: 800, color: '#2b2b2b' }); wrap(tl.lines[0], tw - 244, 24, 500, 3).forEach((s2, j) => text(s2, x + 222, ty + 140 + j * 30, { size: 24, weight: 500, color: '#6b6258' })) }
    else { text(tl.head, x + tw / 2, ty + 76, { size: 34, weight: 800, color: '#2b2b2b', align: 'center' }); text('BLIK na numer', x + tw / 2, ty + 124, { size: 28, weight: 600, color: '#6b6258', align: 'center' }); text(tl.phone, x + tw / 2, ty + 192, { size: 54, weight: 800, color: '#e8952f', align: 'center' }) }
  })
}
// Napisy pieśni: biały tekst, miękki cień, przenikanie przy zmianie zwrotki.
function lyrics(t) {
  if (!S.lyricsOn) return
  // napisy dopiero wracają (były wyłączone, scena bez napisów) — bez przenikania ze starą zwrotką
  if (t - lyricSeen > 500) { lyricShown = studio.lyrics; lyricPrev = ''; lyricAt = 0 }
  lyricSeen = t
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
  const L = lowerLookOf(), who = fill(L.name), what = fill(L.sub)
  if (!who && !what) return
  // po wyłączeniu pasek wyjeżdża w lewo (pół sekundy)
  const off = !S.lowerThird
  if (off && !(S.lowerOff && t - S.lowerOff < 500)) return
  const k = off ? 1 - Math.min(1, (t - S.lowerOff) / 500) : Math.min(1, (t - S.lowerAt) / 500), e = 1 - Math.pow(1 - k, 3)
  const hasLogo = L.logo !== false, tx = hasLogo ? 222 : 44, clean = L.style === 'edit' // napisy zaczynają się za logo
  const maxText = 1500 - tx - 60
  const name = fitLine(who, maxText, 46, 34, 800)
  const sub = fitLine(what, maxText, 32, 24, 500)
  g.save(); g.font = `800 ${name.size}px "Segoe UI", system-ui, sans-serif`; const w1 = g.measureText(name.str).width
  g.font = `500 ${sub.size}px "Segoe UI", system-ui, sans-serif`; const w2 = g.measureText(sub.str).width; g.restore()
  const w = Math.min(1500, Math.max(hasLogo ? 620 : 420, tx + Math.max(w1, w2) + 60)), bh = 150
  const x = -w + (w + 60) * e, y = H - 250
  g.save(); g.globalAlpha = e
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30
  if (clean) { rounded(x, y, w, bh, 12); g.fillStyle = '#fbf3e6'; g.fill() } else glassPanel(x, y, w, bh, 'rgba(16,10,6,0.86)')
  g.shadowBlur = 0
  g.fillStyle = L.color || '#f6a836'; g.fillRect(x + 18, y + bh - 6, w - 36, 6)
  // logo: białe kółko wystające nad pasek
  if (hasLogo) {
    const cx = x + 100, cy = y + bh / 2, r = 92
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 24
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.shadowBlur = 0
    const lg = img('./znak-obrys.png')
    if (lg) g.drawImage(lg, cx - 72, cy - 72, 144, 144)
  }
  g.restore()
  text(name.str, x + tx, y + (what ? 66 : 88), { size: name.size, weight: clean ? 400 : 800, font: clean ? 'display' : 'ui', color: L.ink || (clean ? '#1a2a9a' : '#fff'), alpha: e })
  if (what) text(sub.str, x + tx, y + 116, { size: sub.size, weight: clean ? 700 : 500, font: clean ? 'sans' : 'ui', color: L.ink || (clean ? '#1a2a9a' : '#d6d8e0'), alpha: e })
}
