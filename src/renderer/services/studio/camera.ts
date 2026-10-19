// Kamera (ATEM po USB): wybór urządzenia i rysowanie obrazu z kamery.
import { H, W, studio } from './state'
import { fit, g, text } from './paint'

let camVideo: HTMLVideoElement = null, camStream: MediaStream = null

export function drawCamera(x = 0, y = 0, w = W, h = H) {
  if (camVideo && camVideo.readyState >= 2) fit(camVideo, camVideo.videoWidth, camVideo.videoHeight, x, y, w, h, 'cover')
  else { g.fillStyle = '#000'; g.fillRect(x, y, w, h); text(studio.camera ? 'Czekam na obraz z kamery…' : 'Wybierz kamerę (ATEM)', x + w / 2, y + h / 2, { size: Math.max(24, h / 20), color: '#8f98a8', align: 'center' }) }
}
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
