// Wysyłka surowych klatek do procesu głównego (FFmpeg) poza wątkiem rysowania: przekazanie kilku MB przez IPC
// trwa kilka ms na klatkę — tutaj nie zabiera czasu pętli studia. Bufor wraca do puli okna (bez nowych tablic).
let port: MessagePort | null = null
self.onmessage = (e: MessageEvent) => {
  if (e.data?.port) { port = e.data.port; return }
  const b = e.data as Uint8Array
  try { port?.postMessage(b) } catch { /* zamknięty */ }
  ;(self as any).postMessage(b, [b.buffer])
}
