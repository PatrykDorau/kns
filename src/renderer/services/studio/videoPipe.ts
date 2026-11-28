// Kanał surowych klatek do FFmpeg: Worker + MessagePort prosto do procesu głównego. Wątek rysowania tylko kopiuje
// klatkę do bufora z puli i oddaje go (bez kopii) — serializacja i wysyłka dzieją się w Workerze.
// Bez kanału (starsza wersja preload, błąd) — zwykłe IPC jak dawniej.
import { api } from '@/stores'

let worker: Worker | null = null, ready: Promise<boolean> | null = null
const pool: Uint8Array[] = []
export function videoPipe(): Promise<boolean> {
  if (ready) return ready
  ready = new Promise<boolean>(res => {
    if (!api.studioVideoPort) return res(false)
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data !== 'kns-video-port' || !e.ports?.[0]) return
      removeEventListener('message', on)
      try {
        worker = new Worker(new URL('./videoSender.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = ev => { if (pool.length < 4) pool.push(ev.data) }
        worker.postMessage({ port: e.ports[0] }, [e.ports[0]])
        res(true)
      } catch { worker = null; res(false) }
    }
    addEventListener('message', on)
    api.studioVideoPort()
    setTimeout(() => { removeEventListener('message', on); res(!!worker) }, 3000)
  })
  return ready
}
// Bufor na klatkę z puli (wraca z Workera po wysłaniu).
export function frameBuffer(size: number) {
  let b = pool.pop()
  while (b && b.length !== size) b = pool.pop()
  return b || new Uint8Array(size)
}
// Klatka do FFmpeg. `own` — bufor z frameBuffer() (przekazany bez kopii, potem wraca do puli).
export function sendVideo(b: Uint8Array, own = false) {
  if (!worker) { api.studioVideo(b); return }
  if (!own) { const c = frameBuffer(b.length); c.set(b); b = c }
  worker.postMessage(b, [b.buffer])
}
