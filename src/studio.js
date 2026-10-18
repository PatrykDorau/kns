// Studio streamu: cały obraz transmisji składa aplikacja (płótno 1920×1080) — kamera z ATEM (USB), napisy pieśni
// z prawdziwym cieniem, sceny (odliczanie z ogłoszeniami, pętla ogłoszeń, rzutnik, rzutnik + kamera w okienku,
// plansza końcowa) i pasek z mówcą. Kodowanie: WebCodecs, sprzętowo na karcie graficznej (H.264 High, stała
// przepływność, klatka kluczowa co 2 s) → FFmpeg w procesie głównym tylko wysyła na YouTube. Dźwięk: ATEM (USB)
// + dźwięk filmów ze scen, zmiksowany tutaj (PCM 48 kHz) → FFmpeg koduje AAC. Podgląd = to samo płótno.
// Działa niezależnie od otwartego widoku (moduł), żeby wyjście z ekranu Stream nie przerwało transmisji.
import { reactive } from 'vue'
import { api, nearestService, projectorGraphics, serviceTime, servicePlace } from './store.js'

export const SCENES = [
  ['camera', 'Kamera'],
  ['projector', 'Rzutnik'],
  ['projectorPip', 'Rzutnik + kamera'],
  ['countdown', 'Odliczanie'],
  ['announcements', 'Ogłoszenia'],
  ['end', 'Koniec'],
]
export const studio = reactive({
  scene: 'camera', lyricsOn: true, lowerThird: false, lyrics: '',
  camera: '', audio: '', fps: 30, bitrate: 6800000, live: false, error: '', encoder: '',
  hardware: null, // null — nie sprawdzono; true/false — czy karta koduje H.264
  projector: { kind: 'none' }, // to, co pokazuje rzutnik (etap 2): { kind: 'image'|'video'|'text'|'none', url, text, style, playing, time, at }
})
const W = 1920, H = 1080
let canvas = null, g = null, timer = 0, frameNo = 0, needKey = true
let camVideo = null, camStream = null, encoder = null
let sceneFrom = null, sceneAt = 0 // przejście między scenami (przenikanie)
let lyricShown = '', lyricPrev = '', lyricAt = 0
let lowerAt = 0
const images = new Map() // adres → obraz (grafiki ogłoszeń, logo, rzutnik)

/* ---------- pomocnicze ---------- */
function img(url) {
  if (!url) return null
  let im = images.get(url)
  if (!im) {
    im = new Image()
    if (/^https?:/.test(url)) im.crossOrigin = 'anonymous' // bez tego płótno „brudzi się” i karta nie zakoduje klatki
    im.src = url
    images.set(url, im)
  }
  return im.complete && im.naturalWidth ? im : null
}
function fit(src, sw, sh, x, y, w, h, mode = 'contain') {
  const s = mode === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh)
  const dw = sw * s, dh = sh * s
  g.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}
function rounded(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r) }
// Grafika na cały kadr: rozmyte tło z tej samej grafiki + grafika w całości.
function fullImage(im) {
  g.save(); g.filter = 'blur(40px) brightness(0.45)'; fit(im, im.naturalWidth, im.naturalHeight, -60, -60, W + 120, H + 120, 'cover'); g.restore()
  fit(im, im.naturalWidth, im.naturalHeight, 0, 0, W, H, 'contain')
}
// Tło planszy: ciemne, z wolno płynącymi plamami w kolorach kościoła.
function background(t) {
  g.fillStyle = '#0f1013'; g.fillRect(0, 0, W, H)
  const blob = (cx, cy, r, color) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(15,16,19,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
  blob(W * (0.25 + 0.08 * Math.sin(t / 7000)), H * (0.3 + 0.1 * Math.cos(t / 9000)), 900, 'rgba(232,163,61,0.32)')
  blob(W * (0.8 + 0.06 * Math.cos(t / 8000)), H * (0.75 + 0.08 * Math.sin(t / 6000)), 800, 'rgba(224,122,95,0.26)')
  blob(W * (0.6 + 0.1 * Math.sin(t / 11000)), H * 0.1, 600, 'rgba(169,139,255,0.12)')
}
function text(str, x, y, { size = 48, weight = 600, color = '#fff', align = 'left', alpha = 1, shadow = 0 } = {}) {
  g.save()
  g.globalAlpha *= alpha
  g.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = shadow; g.shadowOffsetY = shadow / 6 }
  g.fillText(str, x, y)
  g.restore()
}
function logo(x, y, h) { const im = img('./znak.png'); if (im) g.drawImage(im, x, y, h * im.naturalWidth / im.naturalHeight, h) }
const svcWhen = svc => (svc ? new Date(svc.date + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + serviceTime(svc) : '')
// Grafiki ogłoszeń (zaznaczone „Pokaż na nabożeństwie”) — kolejno co 8 s, z przenikaniem.
function carousel(t, every = 8000) {
  const list = projectorGraphics.value.map(x => img(x.image)).filter(Boolean)
  if (!list.length) return null
  const i = Math.floor(t / every) % list.length, k = (t % every) / 600
  return { cur: list[i], prev: list[(i - 1 + list.length) % list.length], mix: Math.min(1, k) }
}
function camera(x = 0, y = 0, w = W, h = H) {
  if (camVideo && camVideo.readyState >= 2) fit(camVideo, camVideo.videoWidth, camVideo.videoHeight, x, y, w, h, 'cover')
  else { g.fillStyle = '#000'; g.fillRect(x, y, w, h); text(studio.camera ? 'Czekam na obraz z kamery…' : 'Wybierz kamerę (ATEM)', x + w / 2, y + h / 2, { size: Math.max(24, h / 20), color: '#8f98a8', align: 'center' }) }
}

/* ---------- styl grafik ogłoszeń: pogniecony papier, karta, logo u dołu ---------- */
const CARD = { x: 80, y: 80, w: W - 160, h: H - 175 }
let paperCanvas = null
function paper() {
  if (!paperCanvas) {
    // raz: jasny papier z delikatnymi „zagnieceniami” i ziarnem
    paperCanvas = document.createElement('canvas'); paperCanvas.width = W; paperCanvas.height = H
    const p = paperCanvas.getContext('2d')
    p.fillStyle = '#efece6'; p.fillRect(0, 0, W, H)
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 70; i++) {
      p.beginPath()
      const x = rnd() * W, y = rnd() * H
      p.moveTo(x, y)
      for (let k = 0; k < 3; k++) p.lineTo(x + (rnd() - 0.5) * 900, y + (rnd() - 0.5) * 700)
      p.closePath()
      p.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,110,95,0.045)'
      p.fill()
    }
    const im = p.getImageData(0, 0, W, H), d = im.data
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    p.putImageData(im, 0, 0)
  }
  g.drawImage(paperCanvas, 0, 0)
}
function cardLogo() {
  const im = img('./znak.png')
  if (!im) return
  const h = 190, w = h * im.naturalWidth / im.naturalHeight
  g.drawImage(im, W / 2 - w / 2, CARD.y + CARD.h - h / 2, w, h)
}
// Timer u góry: pomarańczowy z ciemną obwódką (jak logo), na krawędzi karty.
function timerBadge() {
  const svc = nearestService.value
  const start = svc ? new Date(`${svc.date}T${serviceTime(svc)}`).getTime() : 0
  const left = Math.max(0, Math.ceil((start - Date.now()) / 1000))
  const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60
  const clock = left ? (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0') : ''
  const w = left ? (h ? 760 : 660) : 520, bh = 130, x = W / 2 - w / 2, y = 14
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 24; g.shadowOffsetY = 6
  rounded(x, y, w, bh, bh / 2); g.fillStyle = '#f6a836'; g.fill()
  g.shadowColor = 'transparent'
  g.lineWidth = 8; g.strokeStyle = '#2b2b2b'; g.stroke()
  g.restore()
  if (left) {
    text('ZACZYNAMY ZA', x + 52, y + 80, { size: 30, weight: 800, color: '#2b2b2b' })
    text(clock, x + w - 48, y + 98, { size: 84, weight: 800, color: '#2b2b2b', align: 'right' })
  } else text('ZACZYNAMY!', W / 2, y + 90, { size: 64, weight: 800, color: '#2b2b2b', align: 'center' })
}

/* ---------- sceny ---------- */
const SCENE_DRAW = {
  camera(t) { camera(); lowerThird(t); lyrics(t) },
  // Odliczanie: grafiki ogłoszeń na cały ekran (zmiana co 8 s), timer u góry — na papierowym marginesie, jak logo.
  countdown(t) {
    const c = carousel(t)
    if (c) {
      fit(c.prev, c.prev.naturalWidth, c.prev.naturalHeight, 0, 0, W, H, 'cover')
      if (c.mix < 1) { g.save(); g.globalAlpha = c.mix; fit(c.cur, c.cur.naturalWidth, c.cur.naturalHeight, 0, 0, W, H, 'cover'); g.restore() } else fit(c.cur, c.cur.naturalWidth, c.cur.naturalHeight, 0, 0, W, H, 'cover')
    } else {
      // bez grafik: plansza w tym samym stylu — papier, pomarańczowa karta, logo u dołu
      const svc = nearestService.value
      paper()
      const gr = g.createLinearGradient(CARD.x, CARD.y, CARD.x + CARD.w, CARD.y + CARD.h)
      gr.addColorStop(0, '#f0a24f'); gr.addColorStop(1, '#dc7a3c')
      g.fillStyle = gr; g.fillRect(CARD.x, CARD.y, CARD.w, CARD.h)
      text('Nabożeństwo', W / 2, 470, { size: 120, weight: 800, color: '#2a1a10', align: 'center' })
      if (svc) {
        text(svcWhen(svc).replace(/^./, x => x.toUpperCase()), W / 2, 590, { size: 54, weight: 600, color: '#2a1a10', align: 'center' })
        text(servicePlace(svc), W / 2, 670, { size: 44, weight: 500, color: '#3d2615', align: 'center' })
        const sermon = [svc.sermonTitle, svc.passage].filter(Boolean).join(' · ')
        if (sermon) text(sermon, W / 2, 780, { size: 46, weight: 700, color: '#fff7ec', align: 'center' })
      }
      cardLogo()
    }
    timerBadge()
  },
  announcements(t) {
    const c = carousel(t, 10000)
    if (!c) { paper(); text('Brak grafik ogłoszeń — zaznacz „Pokaż na nabożeństwie” w ogłoszeniu', W / 2, H / 2, { size: 40, color: '#6b6258', align: 'center' }); return }
    fit(c.prev, c.prev.naturalWidth, c.prev.naturalHeight, 0, 0, W, H, 'cover')
    if (c.mix < 1) { g.save(); g.globalAlpha = c.mix; fit(c.cur, c.cur.naturalWidth, c.cur.naturalHeight, 0, 0, W, H, 'cover'); g.restore() } else fit(c.cur, c.cur.naturalWidth, c.cur.naturalHeight, 0, 0, W, H, 'cover')
  },
  end() {
    paper()
    g.fillStyle = '#fbf8f3'; g.fillRect(CARD.x, CARD.y, CARD.w, CARD.h)
    text('Dziękujemy, że byliście z nami!', W / 2, 470, { size: 96, weight: 800, color: '#e8952f', align: 'center' })
    const svc = nearestService.value
    if (svc && svc.date > new Date().toISOString().slice(0, 10)) text('Do zobaczenia: ' + svcWhen(svc) + ' · ' + servicePlace(svc), W / 2, 590, { size: 46, weight: 600, color: '#2b2b2b', align: 'center' })
    text('Kościół Na Skale · kns-nabo.netlify.app', W / 2, 690, { size: 38, weight: 500, color: '#6b6258', align: 'center' })
    cardLogo()
  },
  projector(t) { projectorFrame(t); lyrics(t) },
  projectorPip(t) {
    projectorFrame(t)
    // okienko z kamerą (z ATEM — to, co jest na wizji), prawy dolny róg
    const w = 560, h = 315, x = W - w - 48, y = H - h - 48
    g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 40; rounded(x, y, w, h, 22); g.fillStyle = '#000'; g.fill(); g.restore()
    g.save(); rounded(x, y, w, h, 22); g.clip(); camera(x, y, w, h); g.restore()
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; rounded(x, y, w, h, 22); g.stroke(); g.restore()
  },
}
// Napisy pieśni: biały tekst, miękki cień, przenikanie przy zmianie zwrotki.
function lyrics(t) {
  if (!studio.lyricsOn) return
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
// Pasek z mówcą i tytułem kazania (wjeżdża z lewej).
function lowerThird(t) {
  const svc = nearestService.value
  if (!studio.lowerThird || !svc || !(svc.speaker || svc.sermonTitle)) return
  const k = Math.min(1, (t - lowerAt) / 500), e = 1 - Math.pow(1 - k, 3)
  const x = -700 + 760 * e, y = H - 250, w = 900
  g.save(); g.globalAlpha = e
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30
  rounded(x, y, w, 150, 18); g.fillStyle = 'rgba(15,16,19,0.88)'; g.fill(); g.shadowBlur = 0
  g.fillStyle = '#e8a33d'; g.fillRect(x, y, 10, 150)
  g.restore()
  text(svc.speaker || 'Kazanie', x + 44, y + 64, { size: 46, weight: 800, alpha: e })
  text([svc.sermonTitle, svc.passage].filter(Boolean).join(' · '), x + 44, y + 116, { size: 32, weight: 500, color: '#d6d8e0', alpha: e })
}
// To, co pokazuje rzutnik (etap 2): grafika, film, tekst/slajd.
let projVideo = null
function projectorFrame(t) {
  const p = studio.projector
  if (p.kind === 'image' && p.url) { const im = img(p.url); if (im) { fullImage(im); return } }
  if (p.kind === 'video' && p.url) {
    if (!projVideo) { projVideo = document.createElement('video'); projVideo.crossOrigin = 'anonymous'; projVideo.playsInline = true; connectMedia(projVideo) }
    if (projVideo.dataset.src !== p.url) { projVideo.dataset.src = p.url; projVideo.src = p.url }
    // zgranie z rzutnikiem: czas i pauza
    const want = (p.time || 0) + (p.playing ? (Date.now() - (p.at || Date.now())) / 1000 : 0)
    if (projVideo.readyState >= 1 && Math.abs(projVideo.currentTime - want) > 0.6) projVideo.currentTime = want
    if (p.playing && projVideo.paused) projVideo.play().catch(() => {})
    if (!p.playing && !projVideo.paused) projVideo.pause()
    if (projVideo.readyState >= 2) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); fit(projVideo, projVideo.videoWidth, projVideo.videoHeight, 0, 0, W, H) } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
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

/* ---------- pętla rysowania i kodowanie ---------- */
function frame() {
  const t = performance.now()
  const draw = SCENE_DRAW[studio.scene] || SCENE_DRAW.camera
  draw(t)
  if (sceneFrom && t - sceneAt < 500) {
    // przenikanie: poprzednia scena znika
    g.save(); g.globalAlpha = 1 - (t - sceneAt) / 500
    const tmp = getScratch(); const sg = tmp.getContext('2d'); const keep = g; g = sg
    try { (SCENE_DRAW[sceneFrom] || SCENE_DRAW.camera)(t) } finally { g = keep }
    g.drawImage(tmp, 0, 0); g.restore()
  } else sceneFrom = null
  if (encoder && encoder.state === 'configured') {
    if (encoder.encodeQueueSize > 4) return // karta nie nadąża — klatka pominięta zamiast opóźnienia
    const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1000) })
    const key = needKey || frameNo % (studio.fps * 2) === 0
    needKey = false
    encoder.encode(vf, { keyFrame: key })
    vf.close()
    frameNo++
  }
}
let scratch = null
function getScratch() { if (!scratch) { scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H } return scratch }

export function setScene(id) {
  if (id === studio.scene) return
  sceneFrom = studio.scene; sceneAt = performance.now()
  studio.scene = id
}
export function toggleLowerThird() { studio.lowerThird = !studio.lowerThird; lowerAt = performance.now() }

// Płótno studia (podgląd w oknie — ten sam obraz, który idzie na YouTube).
export function studioCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    canvas.className = 'studio-canvas'
    g = canvas.getContext('2d', { alpha: false })
  }
  if (!timer) timer = setInterval(frame, 1000 / studio.fps)
  return canvas
}
export function pauseIdle() { if (!studio.live && timer) { clearInterval(timer); timer = 0 } }
export function setFps(fps) {
  studio.fps = [25, 30, 50, 60].includes(+fps) ? +fps : 30
  if (timer) { clearInterval(timer); timer = setInterval(frame, 1000 / studio.fps) }
}

/* ---------- kamera (ATEM po USB) ---------- */
export async function listCameras() {
  const all = await navigator.mediaDevices.enumerateDevices()
  return { video: all.filter(d => d.kind === 'videoinput'), audio: all.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications') }
}
export async function setCamera(deviceId) {
  studio.camera = deviceId || ''
  camStream?.getTracks().forEach(tr => tr.stop())
  camStream = null
  if (!deviceId) return
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: studio.fps } }, audio: false })
    if (!camVideo) { camVideo = document.createElement('video'); camVideo.muted = true; camVideo.playsInline = true }
    camVideo.srcObject = camStream
    await camVideo.play().catch(() => {})
    studio.error = ''
  } catch (e) {
    studio.error = /NotReadable|Abort|TrackStart/.test(e?.name) ? 'Kamera zajęta przez inny program (np. OBS) — zamknij go.' : 'Nie mogę otworzyć kamery: ' + (e?.message || e)
  }
}

/* ---------- dźwięk: ATEM + filmy ze scen → PCM 48 kHz do FFmpeg ---------- */
let ac = null, mix = null, worklet = null, micSource = null, micStream = null, mediaSources = new WeakSet()
const WORKLET = `class Pcm extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(2048 * 2); this.n = 0 }
  process(inputs) {
    const ch = inputs[0], l = ch[0], r = ch[1] || ch[0]
    if (!l) return true
    for (let i = 0; i < l.length; i++) {
      this.buf[this.n++] = Math.max(-32768, Math.min(32767, l[i] * 32767))
      this.buf[this.n++] = Math.max(-32768, Math.min(32767, r[i] * 32767))
      if (this.n >= this.buf.length) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = new Int16Array(2048 * 2); this.n = 0 }
    }
    return true
  }
}
registerProcessor('pcm', Pcm)`
async function audioGraph() {
  if (ac) return
  ac = new AudioContext({ sampleRate: 48000 })
  mix = ac.createGain()
  // cisza jako stałe źródło — dźwięk płynie także bez mikrofonu
  const silence = ac.createConstantSource(); silence.offset.value = 0; silence.connect(mix); silence.start()
  await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })))
  worklet = new AudioWorkletNode(ac, 'pcm', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' })
  worklet.port.onmessage = e => { if (studio.live) api.studioAudio(new Uint8Array(e.data)) }
  mix.connect(worklet)
}
function connectMedia(el) {
  audioGraph().then(() => { if (mediaSources.has(el)) return; mediaSources.add(el); ac.createMediaElementSource(el).connect(mix) })
}
export async function setAudio(deviceId) {
  studio.audio = deviceId || ''
  await audioGraph()
  micSource?.disconnect(); micStream?.getTracks().forEach(tr => tr.stop())
  micSource = null; micStream = null
  if (!deviceId) return
  try {
    // dźwięk z miksera bez „poprawiania” (bez tłumienia echa i szumów)
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 }, video: false })
    micSource = ac.createMediaStreamSource(micStream)
    micSource.connect(mix)
  } catch (e) { studio.error = 'Nie mogę otworzyć dźwięku: ' + (e?.message || e) }
}

/* ---------- kodowanie ---------- */
const config = (hw) => ({ codec: 'avc1.640028', width: W, height: H, bitrate: studio.bitrate, framerate: studio.fps, hardwareAcceleration: hw, latencyMode: 'realtime', bitrateMode: 'constant', avc: { format: 'annexb' } })
// Czy karta graficzna zakoduje H.264 1080p (WebCodecs) — od tego zależy studio; bez tego zostaje tryb prosty.
export async function checkHardware() {
  if (typeof VideoEncoder === 'undefined') return (studio.hardware = false)
  try { studio.hardware = !!(await VideoEncoder.isConfigSupported(config('prefer-hardware'))).supported } catch { studio.hardware = false }
  return studio.hardware
}
export async function startEncoding() {
  await audioGraph()
  if (ac.state === 'suspended') await ac.resume()
  encoder?.close?.()
  encoder = new VideoEncoder({
    output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); api.studioVideo(b) },
    error: e => { studio.error = 'Kodowanie obrazu: ' + (e?.message || e) },
  })
  encoder.configure(config('prefer-hardware'))
  studio.encoder = 'karta graficzna (WebCodecs)'
  frameNo = 0; needKey = true
  studio.live = true
}
export function stopEncoding() {
  studio.live = false
  try { encoder?.close() } catch { /* już zamknięty */ }
  encoder = null
}
// FFmpeg wystartował od nowa (np. po zerwaniu łącza) — następna klatka kluczowa, żeby YouTube od razu miał obraz.
export function requestKeyFrame() { needKey = true }
