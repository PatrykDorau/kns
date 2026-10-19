// Kodowanie obrazu: WebCodecs, sprzętowo na karcie graficznej (H.264 High, stała przepływność,
// klatka kluczowa co 2 s) → FFmpeg w procesie głównym tylko wysyła na YouTube.
import { api } from '@/stores'
import { H, W, studio } from './state'
import { resumeAudio } from './audio'

let encoder: VideoEncoder = null, frameNo = 0, needKey = true

const config = (hw: HardwareAcceleration): VideoEncoderConfig => ({ codec: 'avc1.640028', width: W, height: H, bitrate: studio.bitrate, framerate: studio.fps, hardwareAcceleration: hw, latencyMode: 'realtime', bitrateMode: 'constant', avc: { format: 'annexb' } })
// Czy karta graficzna zakoduje H.264 1080p (WebCodecs) — od tego zależy studio; bez tego zostaje tryb prosty.
export async function checkHardware() {
  if (typeof VideoEncoder === 'undefined') return (studio.hardware = false)
  try { studio.hardware = !!(await VideoEncoder.isConfigSupported(config('prefer-hardware'))).supported } catch { studio.hardware = false }
  return studio.hardware
}
export async function startEncoding() {
  await resumeAudio()
  encoder?.close?.()
  encoder = new VideoEncoder({
    output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); api.studioVideo(b) },
    error: e => { studio.error = 'Kodowanie obrazu: ' + (e?.message || e) },
  })
  encoder.configure(config('prefer-hardware'))
  studio.encoder = 'karta graficzna (WebCodecs)'
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
  if (encoder.encodeQueueSize > 4) { studio.skipped++; return } // karta nie nadąża — klatka pominięta zamiast opóźnienia
  const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1000) })
  const key = needKey || frameNo % (studio.fps * 2) === 0
  needKey = false
  encoder.encode(vf, { keyFrame: key })
  vf.close()
  frameNo++
}
