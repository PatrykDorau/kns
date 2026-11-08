// Tłumaczenie na żywo bez serwera mediów: tłumacz nadaje dźwięk prosto do każdego słuchacza (WebRTC, jedno połączenie
// na słuchacza — dobrze działa do ok. 15 osób). Kanał Supabase Realtime „kns-tl-<id kanału>” służy tylko do zestawienia
// połączeń (wiadomości „sig”). Ten sam protokół ma strona słuchacza (public/sluchaj.html):
//   słuchacz → { type: 'hello', from }            tłumacz → { type: 'offer', to, sdp }
//   słuchacz → { type: 'answer', to: 'tx', from, sdp }  obie strony → { type: 'ice', to, from, c }
//   tłumacz → { type: 'start' } (wznowił — słuchacze witają się znowu), { type: 'end' }; słuchacz → { type: 'bye', to: 'tx', from }
// W teście z udawaną bazą (window.__db) zamiast Realtime jest BroadcastChannel między kartami tej samej przeglądarki.
export const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export type Msg = { type: string, to?: string, from?: string, sdp?: RTCSessionDescriptionInit, c?: RTCIceCandidateInit }
export type Transport = { ready: Promise<void>, send: (m: Msg) => void, on: (f: (m: Msg) => void) => void, close: () => void }

export function makeTransport(sb: any, sid: string): Transport {
  const name = 'kns-tl-' + sid
  if (typeof window !== 'undefined' && (window as any).__db) {
    const bc = new BroadcastChannel(name)
    return { ready: Promise.resolve(), send: m => bc.postMessage(m), on: f => { bc.onmessage = e => f(e.data) }, close: () => bc.close() }
  }
  const ch = sb.channel(name, { config: { broadcast: { self: false } } })
  let cb: (m: Msg) => void = () => {}
  ch.on('broadcast', { event: 'sig' }, ({ payload }: any) => cb(payload))
  const ready = new Promise<void>((ok, bad) => ch.subscribe((s: string) => {
    if (s === 'SUBSCRIBED') ok()
    else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') bad(new Error('Brak połączenia z kanałem tłumaczenia — sprawdź internet.'))
  }))
  return { ready, send: m => { ch.send({ type: 'broadcast', event: 'sig', payload: m }) }, on: f => { cb = f }, close: () => { sb.removeChannel(ch) } }
}

// Nadawanie: każdy „hello” — nowe połączenie z tym słuchaczem. onCount — liczba połączonych słuchaczy.
export function broadcast(t: Transport, stream: MediaStream, onCount: (n: number) => void) {
  const peers = new Map<string, RTCPeerConnection>()
  const count = () => [...peers.values()].filter(p => p.connectionState === 'connected').length
  const drop = (id: string) => { peers.get(id)?.close(); peers.delete(id); onCount(count()) }
  let queue = Promise.resolve()
  async function handle(m: Msg) {
    if (m.type === 'hello' && m.from) {
      const id = m.from
      peers.get(id)?.close()
      const pc = new RTCPeerConnection({ iceServers: ICE })
      peers.set(id, pc)
      for (const tr of stream.getAudioTracks()) pc.addTrack(tr, stream)
      pc.onicecandidate = e => { if (e.candidate) t.send({ type: 'ice', to: id, from: 'tx', c: e.candidate.toJSON() }) }
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (peers.get(id) === pc) drop(id) } else onCount(count()) }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      t.send({ type: 'offer', to: id, sdp: { type: offer.type, sdp: offer.sdp } })
      return
    }
    if (m.to !== 'tx' || !m.from) return
    const pc = peers.get(m.from)
    if (m.type === 'answer' && pc && m.sdp) await pc.setRemoteDescription(m.sdp)
    else if (m.type === 'ice' && pc && m.c) await pc.addIceCandidate(m.c).catch(() => {})
    else if (m.type === 'bye') drop(m.from)
  }
  t.on(m => { queue = queue.then(() => handle(m)).catch(() => {}) })
  t.ready.then(() => t.send({ type: 'start' })).catch(() => {})
  return {
    count,
    // zmiana źródła (inny mikrofon) bez zrywania połączeń
    async replace(track: MediaStreamTrack) { for (const pc of peers.values()) for (const s of pc.getSenders()) if (s.track?.kind === 'audio') await s.replaceTrack(track) },
    stop() { try { t.send({ type: 'end' }) } catch { /* bez kanału */ } peers.forEach(p => p.close()); peers.clear(); setTimeout(() => t.close(), 300) },
  }
}

// Ton testowy (sprawdzenie słuchaczy przed nabożeństwem): krótkie piknięcia co sekundę.
export function testTone(): { stream: MediaStream, stop: () => void } {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator(), gain = ctx.createGain(), dst = ctx.createMediaStreamDestination()
  osc.frequency.value = 660; gain.gain.value = 0
  osc.connect(gain).connect(dst); osc.start()
  const beep = setInterval(() => { gain.gain.setValueAtTime(0.25, ctx.currentTime); gain.gain.setValueAtTime(0, ctx.currentTime + 0.25) }, 1000)
  return { stream: dst.stream, stop: () => { clearInterval(beep); osc.stop(); ctx.close() } }
}
