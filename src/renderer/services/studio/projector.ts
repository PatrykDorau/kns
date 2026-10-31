// Scena „Rzutnik”: obraz rzutnika przez sieć (WebRTC z laptopa przy rzutniku) albo to, co pokazuje Rzutnik
// w tej aplikacji (grafika, film, tekst).
import { H, W, studio } from './state'
import { S, background, fit, fullImage, g, img, text } from './paint'
import { connectMedia } from './audio'

let projVideo: HTMLVideoElement = null, remoteVideo: HTMLVideoElement = null
let lastImage: HTMLImageElement = null // poprzedni slajd — zostaje, dopóki nowy się wczytuje (bez mignięcia pustej planszy)
let held: HTMLCanvasElement = null // klatka filmu sprzed przewinięcia — zostaje na obrazie, dopóki nowa się wczytuje (bez czarnego mignięcia)
function holdFrame(v: HTMLVideoElement) {
  if (v.readyState < 2 || !v.videoWidth) return
  held ||= document.createElement('canvas')
  held.width = v.videoWidth; held.height = v.videoHeight
  held.getContext('2d').drawImage(v, 0, 0)
}
// Rozjazd z rzutnikiem większy niż tyle sekund = przewinięcie. Mniejszy zostaje: każde przewinięcie to zacięcie obrazu.
const SYNC_S = 1
// Obraz rzutnika z innego komputera (WebRTC) — null, gdy połączenie zerwane.
export function setRemoteScreen(stream) {
  if (!stream) { if (remoteVideo) remoteVideo.srcObject = null; studio.remoteScreen = false; return }
  if (!remoteVideo) { remoteVideo = document.createElement('video'); remoteVideo.muted = true; remoteVideo.playsInline = true }
  remoteVideo.srcObject = stream; remoteVideo.play().catch(() => {}); studio.remoteScreen = true
}
export function projectorFrame(t) {
  const p = studio.projector
  // materiał z rzutnika na innym komputerze (własna kopia) — przed obrazem ekranu; ekran tylko, gdy kopii brak
  const mirror = p.remote && ['image', 'video', 'text'].includes(p.kind)
  if (!mirror && studio.remoteScreen && remoteVideo?.readyState >= 2) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); fit(remoteVideo, remoteVideo.videoWidth, remoteVideo.videoHeight, 0, 0, W, H); return }
  if (p.kind === 'loading') {
    if (projVideo && !projVideo.paused) projVideo.pause()
    background(t) // napis tylko na podglądzie — widzowie nie muszą go czytać
    if (S !== studio.program) text(p.ask ? 'Rzutnik pokazuje materiał, którego tu nie ma — zakładka „Z rzutnika”' : p.missing ? 'Rzutnik jeszcze wysyła ten materiał…' : 'Wczytuję materiał z rzutnika…', W / 2, H / 2, { size: 40, color: '#8f98a8', align: 'center' })
    return
  }
  if (p.kind === 'image' && p.url) { const im = img(p.url) || lastImage; if (im) { lastImage = im; fullImage(im); return } }
  if (p.kind === 'video' && p.url) {
    if (!projVideo) { projVideo = document.createElement('video'); projVideo.crossOrigin = 'anonymous'; projVideo.playsInline = true; connectMedia(projVideo) }
    if (projVideo.dataset.src !== p.url) { holdFrame(projVideo); projVideo.dataset.src = p.url; projVideo.src = p.url }
    // kopia filmu z innego komputera — bez dźwięku (dźwięk filmu przychodzi z konsoli)
    projVideo.muted = !!p.remote; projVideo.volume = p.remote ? 0 : 1
    // zgranie z rzutnikiem: czas i pauza
    const want = (p.time || 0) + (p.playing ? (Date.now() - (p.at || Date.now())) / 1000 : 0)
    if (projVideo.readyState >= 1 && !projVideo.seeking && Math.abs(projVideo.currentTime - want) > SYNC_S) { holdFrame(projVideo); projVideo.currentTime = want }
    if (p.playing && projVideo.paused) projVideo.play().catch(() => {})
    if (!p.playing && !projVideo.paused) projVideo.pause()
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H)
    if (projVideo.readyState >= 2 && !projVideo.seeking) fit(projVideo, projVideo.videoWidth, projVideo.videoHeight, 0, 0, W, H)
    else if (held) fit(held, held.width, held.height, 0, 0, W, H)
    return
  }
  if (projVideo && !projVideo.paused) projVideo.pause()
  if (p.kind === 'text' && p.text) {
    const s = p.style || {}
    g.fillStyle = s.bg || '#000'; g.fillRect(0, 0, W, H)
    const lines = String(p.text).split('\n')
    const size = Math.round((s.fs || 12) * 6.5), lh = size * 1.3
    const total = lines.length * lh
    const y0 = s.valign === 'top' ? 120 + size : s.valign === 'bottom' ? H - 120 - total + size : (H - total) / 2 + size
    const align = s.align || 'center', x = align === 'left' ? 120 : align === 'right' ? W - 120 : W / 2
    lines.forEach((l, i) => text(l, x, y0 + i * lh, { size, weight: 700, color: s.color || '#fff', align, shadow: s.shadow ? 16 : 0 }))
    return
  }
  background(t)
  text('Rzutnik nic teraz nie pokazuje', W / 2, H / 2, { size: 40, color: '#8f98a8', align: 'center' })
}
