// Kodowanie obrazu: WebCodecs, sprzętowo na karcie graficznej (H.264 High, stała przepływność,
// klatka kluczowa co 2 s) → FFmpeg w procesie głównym tylko wysyła na YouTube.
// Rozdzielczość wysyłki z „Jakości” (1080p albo 720p): płótno studia zawsze 1920×1080, przy 720p klatka jest
// najpierw zmniejszana (na karcie graficznej) — słabsza karta koduje ponad 2× mniej pikseli.
import { api, settings } from '@/stores'
import { H, W, studio } from './state'
import { resumeAudio } from './audio'

let encoder: VideoEncoder = null, frameNo = 0, needKey = true
// Koder do wyboru w „Jakości”: „gpu” — przeglądarka (WebCodecs) na karcie graficznej; pozostałe — FFmpeg (jak w OBS):
// aplikacja oddaje gotowe klatki, FFmpeg koduje NVENC / QuickSync / AMF albo procesorem (x264).
export const ENCODERS = [
  ['gpu', 'Karta graficzna — przez przeglądarkę', 'Najlżejsze dla komputera: obraz nie opuszcza karty graficznej.'],
  ['nvenc', 'FFmpeg — NVIDIA NVENC', 'Jak w OBS: lepsza jakość przy tej samej przepływności. Klatki są kopiowane do FFmpeg (więcej pracy procesora).'],
  ['qsv', 'FFmpeg — Intel QuickSync', 'Karta zintegrowana Intel przez FFmpeg.'],
  ['amf', 'FFmpeg — AMD AMF', 'Karta AMD przez FFmpeg.'],
  ['x264', 'FFmpeg — procesor (x264)', 'Bez karty graficznej: najwięcej pracy procesora — na starszym komputerze raczej 720p.'],
] as const
let raw = false, rawBusy = 0
let outW = W, outH = H, small: HTMLCanvasElement = null, sctx: CanvasRenderingContext2D = null

export const outSize = (q = settings.streamQuality) => (q === '720' ? [1280, 720] : [W, H])
const config = (hw: HardwareAcceleration, w = W, h = H, fps = studio.fps, bitrate = studio.bitrate): VideoEncoderConfig => ({ codec: 'avc1.640028', width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, latencyMode: 'realtime', bitrateMode: 'constant', avc: { format: 'annexb' } })
// Ile klatek może czekać w koderze, zanim następną pominiemy. Koder sprzętowy (zwłaszcza Intel/AMD przez Windows)
// trzyma kilka klatek „w drodze” nawet wtedy, gdy nadąża — przy progu 4 gubiliśmy klatki, choć karta dawała radę.
// Pół sekundy zapasu: pomijamy dopiero, gdy kolejka naprawdę rośnie.
const maxQueue = (fps: number) => Math.max(8, Math.round(fps / 2))
// Czy karta graficzna zakoduje H.264 1080p (WebCodecs) — od tego zależy studio; bez tego zostaje tryb prosty.
export async function checkHardware() {
  if (typeof VideoEncoder === 'undefined') return (studio.hardware = false)
  try { studio.hardware = !!(await VideoEncoder.isConfigSupported(config('prefer-hardware'))).supported } catch { studio.hardware = false }
  return studio.hardware
}
// klatka do kodera w rozdzielczości wysyłki
function source(canvas: HTMLCanvasElement) {
  if (outW === W) return canvas
  if (!small) { small = document.createElement('canvas'); sctx = small.getContext('2d', { alpha: false }) }
  if (small.width !== outW) { small.width = outW; small.height = outH; sctx.imageSmoothingQuality = 'high' }
  sctx.drawImage(canvas, 0, 0, outW, outH)
  return small
}
// Format surowej klatki z płótna (BGRX / RGBX …) i rozmiar — FFmpeg musi je znać przed pierwszą klatką.
export function rawInfo(canvas: HTMLCanvasElement, quality = settings.streamQuality) {
  ;[outW, outH] = outSize(quality)
  const vf = new VideoFrame(source(canvas), { timestamp: 0 })
  const format = vf.format
  vf.close()
  return { w: outW, h: outH, format }
}
// Klatka do FFmpeg: kopia z karty w tle (bez czekania pętli rysowania); gdy poprzednie jeszcze się kopiują — pominięta.
function sendRaw(canvas: HTMLCanvasElement, t: number, busy: { n: number }, onLost: () => void, send: (b: Uint8Array) => void) {
  if (busy.n >= 2) { onLost(); return }
  const vf = new VideoFrame(source(canvas), { timestamp: Math.round(t * 1000) })
  const opt = { rect: { x: 0, y: 0, width: outW, height: outH }, layout: [{ offset: 0, stride: outW * 4 }] }
  const buf = new Uint8Array(outW * outH * 4)
  busy.n++
  vf.copyTo(buf, opt).then(() => send(buf), () => onLost()).finally(() => { vf.close(); busy.n-- })
}
const rawBusyBox = { n: 0 }
export async function startEncoding(mode = 'gpu') {
  await resumeAudio()
  encoder?.close?.(); encoder = null
  ;[outW, outH] = outSize()
  raw = mode !== 'gpu'; rawBusyBox.n = 0
  if (raw) {
    studio.encoder = (ENCODERS.find(e => e[0] === mode)?.[1] || 'FFmpeg') + ' · ' + outH + 'p'
    frameNo = 0; needKey = true; studio.skipped = 0
    studio.live = true
    return
  }
  encoder = new VideoEncoder({
    output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); api.studioVideo(b) },
    error: e => { studio.error = 'Kodowanie obrazu: ' + (e?.message || e) },
  })
  encoder.configure(config('prefer-hardware', outW, outH))
  studio.encoder = 'karta graficzna · ' + outH + 'p'
  frameNo = 0; needKey = true; studio.skipped = 0
  studio.live = true
}
export function stopEncoding() {
  studio.live = false; raw = false
  try { encoder?.close() } catch { /* już zamknięty */ }
  encoder = null
}
// FFmpeg wystartował od nowa (np. po zerwaniu łącza) — następna klatka kluczowa, żeby YouTube od razu miał obraz.
export function requestKeyFrame() { needKey = true }
// Klatka płótna do kodera (pominięta, gdy karta nie nadąża).
export function encodeFrame(canvas: HTMLCanvasElement, t: number) {
  if (raw) { if (studio.live) sendRaw(canvas, t, rawBusyBox, () => { studio.skipped++ }, b => api.studioVideo(b)); return }
  if (!encoder || encoder.state !== 'configured') return
  if (encoder.encodeQueueSize > maxQueue(studio.fps)) { studio.skipped++; return } // karta nie nadąża — klatka pominięta zamiast opóźnienia
  const vf = new VideoFrame(source(canvas), { timestamp: Math.round(t * 1000) })
  const key = needKey || frameNo % (studio.fps * 2) === 0
  needKey = false
  encoder.encode(vf, { keyFrame: key })
  vf.close()
  frameNo++
}

// Test karty graficznej przed transmisją: przez kilka sekund koduje prawdziwy obraz studia (bez wysyłania)
// w danej rozdzielczości i tempie, tak samo jak w trakcie transmisji. Wynik: procent klatek, które trzeba by pominąć.
export const bench = { running: false }
// Nazwa karty graficznej (do wyniku testu) — z WebGL, bez uprawnień.
export function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const n = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    return n.replace(/^ANGLE \((.*)\)$/, '$1').replace(/,? ?Direct3D.*$/i, '').replace(/^(NVIDIA|AMD|Intel(?:\(R\))?|Google)[^,]*, /, '').replace(/ \(0x[0-9A-F]+\)/gi, '').trim()
  } catch { return '' }
}
export async function benchEncoder(canvas: HTMLCanvasElement, quality: string, fps: number, ms = 4000, mode = 'gpu'): Promise<{ lost: number, error?: string }> {
  if (mode !== 'gpu') return benchFfmpeg(canvas, quality, fps, ms + 1000, mode)
  if (typeof VideoEncoder === 'undefined') return { lost: 100, error: 'Brak kodowania na karcie graficznej.' }
  const [w, h] = outSize(quality)
  let err = ''
  const enc = new VideoEncoder({ output: () => {}, error: e => { err = String(e?.message || e) } })
  bench.running = true
  try {
    enc.configure(config('prefer-hardware', w, h, fps, quality === '720' ? 3500000 : 6800000))
    let c = null, cx = null
    if (w !== W) { c = document.createElement('canvas'); c.width = w; c.height = h; cx = c.getContext('2d', { alpha: false }) }
    let sent = 0, lost = 0, n = 0
    const t0 = performance.now()
    await new Promise<void>(done => {
      const id = setInterval(() => {
        if (performance.now() - t0 > ms || err) { clearInterval(id); done(); return }
        if (enc.encodeQueueSize > maxQueue(fps)) { lost++; return }
        if (cx) cx.drawImage(canvas, 0, 0, w, h)
        const vf = new VideoFrame(c || canvas, { timestamp: Math.round((performance.now() - t0) * 1000) })
        enc.encode(vf, { keyFrame: n++ % (fps * 2) === 0 }); vf.close(); sent++
      }, 1000 / fps)
    })
    await enc.flush().catch(() => {})
    return { lost: err ? 100 : Math.round((lost / Math.max(1, sent + lost)) * 1000) / 10, error: err || undefined }
  } catch (e) { return { lost: 100, error: String(e?.message || e) } }
  finally { bench.running = false; try { enc.close() } catch { /* zamknięty */ } }
}

// Test kodera FFmpeg: prawdziwe klatki studia do FFmpeg, który koduje wybranym koderem „do nikąd” (bez wysyłania).
// Zgubione = pominięte przy kopiowaniu z karty + pominięte przed FFmpeg (gdy koder nie nadąża, kolejka rośnie
// i po pół sekundzie zaległości klatki są pomijane — tak samo jak w transmisji). Tempo z FFmpeg nie jest miarą:
// x264 na starcie zbiera klatki do analizy i przez pierwsze sekundy pokazuje „wolniej”, choć nadąża.
async function benchFfmpeg(canvas: HTMLCanvasElement, quality: string, fps: number, ms: number, mode: string): Promise<{ lost: number, error?: string }> {
  if (studio.live) return { lost: 0, error: 'Trwa transmisja.' }
  bench.running = true
  const keep = [outW, outH]
  try {
    const info = rawInfo(canvas, quality)
    const r = await api.streamBenchStudio?.({ fps, kbps: quality === '720' ? 3500 : 6800, encoder: mode, raw: info })
    if (!r || r.error) return { lost: 100, error: r?.error || 'Brak FFmpeg.' }
    const busy = { n: 0 }
    let sent = 0, lost = 0
    await new Promise(r => setTimeout(r, 600)) // FFmpeg startuje
    const t0 = performance.now()
    await new Promise<void>(done => {
      const id = setInterval(() => {
        if (performance.now() - t0 > ms) { clearInterval(id); done(); return }
        sendRaw(canvas, performance.now(), busy, () => { lost++ }, b => { sent++; api.studioVideo(b) })
      }, 1000 / fps)
    })
    await new Promise(r => setTimeout(r, 500))
    const st: any = (await api.streamState?.()) || {}
    await api.streamStop?.()
    if (st.error) return { lost: 100, error: st.error }
    if (!st.running && !st.time) return { lost: 100, error: 'FFmpeg nie zakodował ani jednej klatki.' }
    const pct = ((lost + (st.skipped || 0)) / Math.max(1, sent + lost)) * 100
    return { lost: Math.round(pct * 10) / 10 }
  } catch (e) { await api.streamStop?.().catch(() => {}); return { lost: 100, error: String(e?.message || e) } }
  finally { bench.running = false; [outW, outH] = keep }
}
