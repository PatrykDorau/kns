// Kamera (ATEM po USB): wybór urządzenia, rysowanie obrazu i pilnowanie, żeby obraz naprawdę płynął.
// Gdy kamerę trzyma inny program (np. OBS — także schowany w zasobniku), gdy po jego zamknięciu urządzenie
// przez chwilę nie daje klatek, gdy obraz stanie albo kabel zostanie odpięty — kamera otwiera się ponownie sama
// (co kilka sekund), a na obrazie widać, na co czeka.
import { H, W, studio } from './state'
import { fit, g, text } from './paint'

let camVideo: HTMLVideoElement = null, camStream: MediaStream = null
let wanted = '' // urządzenie, które ma grać (deviceId)
let seq = 0 // kolejne otwarcia — starsze, spóźnione nie nadpisują nowszego
let lastFrame = 0 // kiedy przyszła ostatnia klatka (performance.now)
let opening = false, retryAt = 0, tries = 0
let note = '' // co widać na obrazie, gdy nie ma klatek
const FROZEN_MS = 4000 // tyle bez nowej klatki = obraz stanął

export function drawCamera(x = 0, y = 0, w = W, h = H) {
  if (camVideo && camVideo.readyState >= 2 && camVideo.videoWidth) fit(camVideo, camVideo.videoWidth, camVideo.videoHeight, x, y, w, h, 'cover')
  else {
    g.fillStyle = '#000'; g.fillRect(x, y, w, h)
    const msg = !studio.camera ? 'Wybierz kamerę (ATEM)' : note || 'Czekam na obraz z kamery…'
    text(msg, x + w / 2, y + h / 2, { size: Math.max(24, h / 20), color: '#8f98a8', align: 'center' })
  }
}
export async function listCameras() {
  const all = await navigator.mediaDevices.enumerateDevices()
  return { video: all.filter(d => d.kind === 'videoinput'), audio: all.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications') }
}
function release() {
  camStream?.getTracks().forEach(tr => tr.stop())
  camStream = null
  if (camVideo) camVideo.srcObject = null
}
async function open() {
  const mine = ++seq, id = wanted
  opening = true
  release()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: studio.fps } }, audio: false })
    if (mine !== seq || id !== wanted) { stream.getTracks().forEach(tr => tr.stop()); return } // w międzyczasie wybrano inną kamerę
    camStream = stream
    if (!camVideo) {
      camVideo = document.createElement('video'); camVideo.muted = true; camVideo.playsInline = true
      const tick = () => { lastFrame = performance.now(); camVideo.requestVideoFrameCallback(tick) }
      camVideo.requestVideoFrameCallback(tick)
    }
    const [track] = stream.getVideoTracks()
    // odpięty kabel, urządzenie zabrane przez inny program — od razu kolejna próba
    track?.addEventListener('ended', () => { if (camStream === stream) later(1000, 'Kamera się rozłączyła — łączę ponownie…') })
    camVideo.srcObject = stream
    lastFrame = performance.now()
    await camVideo.play().catch(() => {})
    studio.error = ''; note = 'Czekam na obraz z kamery…'
  } catch (e) {
    if (mine !== seq) return
    const busy = /NotReadable|Abort|TrackStart/.test(e?.name)
    note = busy ? 'Kamera zajęta przez inny program (np. OBS) — ponawiam…' : 'Nie mogę otworzyć kamery — ponawiam…'
    studio.error = busy ? 'Kamera zajęta przez inny program (np. OBS — sprawdź też zasobnik przy zegarze). Aplikacja sama ponawia próbę.' : 'Nie mogę otworzyć kamery: ' + (e?.message || e) + ' — ponawiam.'
    later(busy ? 3000 : 5000)
  } finally { if (mine === seq) opening = false }
}
function later(ms: number, msg?: string) { if (msg) note = msg; retryAt = performance.now() + ms }

export async function setCamera(deviceId) {
  studio.camera = deviceId || ''
  wanted = deviceId || ''
  tries = 0; retryAt = 0; note = ''
  if (!wanted) { seq++; release(); return }
  await open()
}
// ręcznie: „Połącz ponownie” / „Odśwież kamery”
export function reconnectCamera() { if (wanted) { tries = 0; open() } }

// Strażnik: co sekundę sprawdza, czy obraz płynie; jeśli nie — otwiera kamerę ponownie (coraz rzadziej, najwyżej co 10 s).
setInterval(() => {
  if (!wanted || opening) return
  const now = performance.now()
  if (retryAt && now >= retryAt) { retryAt = 0; tries++; open(); return }
  if (retryAt) return
  const live = camStream?.getVideoTracks()[0]?.readyState === 'live'
  if (!live || now - lastFrame > FROZEN_MS) {
    later(Math.min(10000, 1500 * (tries + 1)), tries ? 'Nadal brak obrazu z kamery — ponawiam (sprawdź kabel USB i czy OBS jest zamknięty)…' : 'Brak obrazu z kamery — łączę ponownie…')
  } else if (tries) { tries = 0; studio.error = '' }
}, 1000)
