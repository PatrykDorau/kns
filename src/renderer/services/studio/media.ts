// Media: materiały z biblioteki (zdjęcia, filmy, napisy, prezentacje) na całym ekranie, w okienku albo jako nakładka;
// filmy grają tylko na wizji (dźwięk w transmisji), prezentacje mogą same zmieniać slajdy.
import { itemById } from '@/stores'
import type { MediaSlide } from '@/types'
import { H, PROJ_MEDIA, W, studio } from './state'
import { projectorFrame } from './projector'
import { S, fit, fullImage, g, img, rounded, text } from './paint'
import { connectMedia } from './audio'

export const mediaUrl = p => (/^https?:\/\//.test(p) ? p : 'media://local/' + encodeURIComponent(p))
export const videos = new Map() // id materiału → <video> (dźwięk filmu idzie do transmisji)
// Materiał do narysowania: dla prezentacji/pętli — jej bieżący slajd.
export function mediaSlide(id: string, at?: number): MediaSlide | null {
  const it = id && itemById(id)
  if (!it || it.missing) return null
  if (it.type !== 'scene') return it
  const list = (it.entries || []).map(e => itemById(e.ref)).filter(x => x && !x.missing)
  if (!list.length) return null
  const n = (((at ?? studio.mplay.slides[id]) || 0) % list.length + list.length) % list.length
  return { ...list[n], deckOf: id, slideNo: n + 1, slideCount: list.length }
}
export function mediaVideo(it) {
  let v = videos.get(it.id)
  if (!v) {
    v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.preload = 'auto'
    v.src = mediaUrl(it.path); videos.set(it.id, v); connectMedia(v)
  }
  return v
}
// Tekst (napis, slajd z tekstem) — jak na rzutniku; jako nakładka bez tła, z cieniem.
export function textItem(p, opaque) {
  if (opaque) { g.fillStyle = p.bg || '#000'; g.fillRect(0, 0, W, H); const bi = p.bgImage && img(mediaUrl(p.bgImage)); if (bi) { fit(bi, bi.naturalWidth, bi.naturalHeight, 0, 0, W, H, 'cover'); g.fillStyle = 'rgba(0,0,0,' + (p.dim ?? 0.45) + ')'; g.fillRect(0, 0, W, H) } }
  const lines = String(p.text || '').split('\n')
  const size = Math.round((p.fs || 12) * 6.5), lh = size * 1.3, total = lines.length * lh
  const y0 = p.valign === 'top' ? 120 + size : p.valign === 'bottom' ? H - 120 - total + size : (H - total) / 2 + size
  const align = p.align || 'center', x = align === 'left' ? 120 : align === 'right' ? W - 120 : W / 2
  lines.forEach((l, i) => text(l, x, y0 + i * lh, { size, weight: 700, color: p.color || '#fff', align, shadow: opaque ? 0 : 24 }))
}
// Cały kadr: opaque — jako scena (z tłem), inaczej nakładka (przezroczystość PNG, napis bez tła).
export function drawMedia(it, opaque) {
  if (it.type === 'image') {
    const im = img(mediaUrl(it.path))
    if (!im) return
    if (opaque) fullImage(im); else fit(im, im.naturalWidth, im.naturalHeight, 0, 0, W, H, 'contain')
  } else if (it.type === 'video') {
    const v = mediaVideo(it)
    if (opaque) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
    if (v.readyState >= 2) fit(v, v.videoWidth, v.videoHeight, 0, 0, W, H)
  } else if (it.type === 'text') textItem(it, opaque)
}
// Prezentacja: przy zmianie slajdu krótkie przenikanie — poprzedni slajd pod spodem, nowy wchodzi (bez przeskoku).
const SLIDE_FADE = 280
const deckLast = new Map<string, { no: number, prev: number, at: number }>() // prezentacja → bieżący i poprzedni slajd
export function drawSlideOf(id: string, draw: (it) => void) {
  const it = mediaSlide(id)
  if (!it) return false
  if (!it.deckOf) { draw(it); return true }
  const now = performance.now()
  let d = deckLast.get(id)
  if (!d) { d = { no: it.slideNo, prev: 0, at: 0 }; deckLast.set(id, d) }
  if (d.no !== it.slideNo) { d.prev = d.no; d.no = it.slideNo; d.at = now }
  const k = Math.min(1, (now - d.at) / SLIDE_FADE), prev = k < 1 && d.prev ? mediaSlide(id, d.prev - 1) : null
  if (!prev) { draw(it); return true }
  draw(prev)
  g.save(); g.globalAlpha *= 1 - Math.pow(1 - k, 2); draw(it); g.restore()
  return true
}
// Okienko w rogu (jak kamera w „Rzutnik + kamera”): materiał przeskalowany do okienka.
export function mediaBox(id, pos) {
  const w = pos.size === 'large' ? 800 : 512, h = w * 9 / 16, m = 48
  const x = pos.corner.includes('l') ? m : W - w - m, y = pos.corner.includes('t') ? m : H - h - m
  g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 40; rounded(x, y, w, h, 22); g.fillStyle = '#000'; g.fill(); g.restore()
  g.save(); rounded(x, y, w, h, 22); g.clip(); g.translate(x, y); g.scale(w / W, h / H)
  if (id === PROJ_MEDIA) projectorFrame(performance.now()); else drawSlideOf(id, it => drawMedia(it, true))
  g.restore()
  g.save(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; rounded(x, y, w, h, 22); g.stroke(); g.restore()
}
export function mediaOverlay() {
  if (S.ovl === 'off') return
  // rzutnik w okienku (albo na cały kadr) na innej scenie
  if (S.omedia === PROJ_MEDIA) { if (S.scene === 'projector') return; if (S.ovl === 'corner') mediaBox(PROJ_MEDIA, S.mpos); else projectorFrame(performance.now()); return }
  const it = mediaSlide(S.omedia)
  if (!it) return
  if (S.ovl === 'corner') mediaBox(S.omedia, S.mpos); else drawSlideOf(S.omedia, x => drawMedia(x, false))
}
// Co jest na wizji: materiał sceny „Media” i materiał nakładki (scena „Media” — bez nakładki).
export function airMedia(L = studio.program) {
  const ids = []
  if (L.scene === 'media' && L.media) ids.push(L.media)
  if (L.ovl !== 'off' && L.omedia && L.scene !== 'media' && !ids.includes(L.omedia)) ids.push(L.omedia)
  return ids
}
// Filmy: grają tylko te na wizji (dźwięk w transmisji); film, który właśnie wszedł na wizję — od początku.
// Prezentacje z „automatycznie”: następny slajd co ustawioną liczbę sekund.
let onAir = new Set(); const stepAt = {}
export function syncVideos() {
  const M = studio.mplay, now = performance.now()
  const air = airMedia()
  const vids = new Set()
  for (const id of air) {
    const it = mediaSlide(id)
    if (it?.type === 'video') { vids.add(it.id); if (!onAir.has(it.id)) { const v = mediaVideo(it); v.currentTime = 0; M.playing = true } }
    const deck = itemById(id)
    if (deck?.type === 'scene') {
      if (!onAir.has(id)) stepAt[id] = now
      if (deck.mAuto && now - (stepAt[id] || now) > (deck.mSec || 8) * 1000 && it?.type !== 'video') { stepAt[id] = now; M.slides = { ...M.slides, [id]: (M.slides[id] || 0) + 1 } }
    }
  }
  onAir = new Set([...air, ...vids])
  for (const [id, v] of videos) {
    v.loop = M.loop; v.volume = Math.max(0, Math.min(1, M.volume))
    if (vids.has(id) && M.playing) { if (v.paused) v.play().catch(() => {}) } else if (!v.paused) v.pause()
  }
  const first = [...vids][0], v = first && videos.get(first)
  M.time = v ? v.currentTime : 0; M.duration = v && isFinite(v.duration) ? v.duration : 0
}
export function mediaCtl(cmd, val) {
  const M = studio.mplay
  const vid = () => { for (const id of airMedia()) { const it = mediaSlide(id); if (it?.type === 'video') return videos.get(it.id) } return null }
  if (cmd === 'play') M.playing = !M.playing
  else if (cmd === 'restart') { const v = vid(); if (v) v.currentTime = 0; M.playing = true }
  else if (cmd === 'seek') { const v = vid(); if (v && isFinite(val)) v.currentTime = val }
  else if (cmd === 'loop') M.loop = !M.loop
  else if (cmd === 'volume') M.volume = +val
  else if (cmd === 'slide') { const id = val.id; stepAt[id] = performance.now(); M.slides = { ...M.slides, [id]: (M.slides[id] || 0) + val.d } }
}
