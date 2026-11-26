// Kodowanie obrazu: WebCodecs, sprzętowo na karcie graficznej (H.264 High, stała przepływność,
// klatka kluczowa co 2 s) → FFmpeg w procesie głównym tylko wysyła na YouTube.
// Rozdzielczość wysyłki z „Jakości” (1080p albo 720p): płótno studia zawsze 1920×1080, przy 720p klatka jest
// najpierw zmniejszana (na karcie graficznej) — słabsza karta koduje ponad 2× mniej pikseli.
import { api, settings } from '@/stores'
import { H, W, studio } from './state'
import { resumeAudio } from './audio'

let encoder: VideoEncoder = null, frameNo = 0, needKey = true
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
export async function startEncoding() {
  await resumeAudio()
  encoder?.close?.()
  ;[outW, outH] = outSize()
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
  studio.live = false
  try { encoder?.close() } catch { /* już zamknięty */ }
  encoder = null
}
// FFmpeg wystartował od nowa (np. po zerwaniu łącza) — następna klatka kluczowa, żeby YouTube od razu miał obraz.
export function requestKeyFrame() { needKey = true }
// Klatka płótna do kodera (pominięta, gdy karta nie nadąża).
export function encodeFrame(canvas: HTMLCanvasElement, t: number) {
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
export async function benchEncoder(canvas: HTMLCanvasElement, quality: string, fps: number, ms = 4000): Promise<{ lost: number, error?: string }> {
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
