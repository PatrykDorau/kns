// Obraz rzutnika przez sieć: laptop przy rzutniku przechwytuje ekran rzutnika (wszystko, co na nim jest — Rzutnik,
// PowerPoint, film, przeglądarka) — sam obraz, bez dźwięku (dźwięk idzie przez konsolę) — i wysyła go na żywo (WebRTC, bezpośrednio między
// komputerami) do laptopa ze streamem — tam to scena „Rzutnik” i „Rzutnik + kamera”.
// Zestawienie połączenia (kto, oferta, odpowiedź, adresy sieciowe) idzie kanałem na żywo z tym samym kluczem co
// napisy przez internet; sam obraz już nie przechodzi przez serwer.
import { reactive } from 'vue'
import { api, screenSignal, uid } from './store.js'

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]

/* ---------- nadawanie (laptop przy rzutniku) ---------- */
export const share = reactive({ on: false, viewers: 0, error: '', key: '' })
let tx = null // { key, sig, stream, peers: Map(id → pc) }
async function captureScreen(displayId) {
  await api.captureTarget?.(displayId) // który ekran (ten z rzutnikiem) — wybiera proces główny
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: { max: 1920 }, height: { max: 1080 } }, audio: false })
}
function txCount() { share.viewers = tx ? [...tx.peers.values()].filter(p => p.connectionState === 'connected').length : 0 }
async function txOffer(id) {
  if (!tx) return
  tx.peers.get(id)?.close()
  if (!tx.stream || tx.stream.getVideoTracks().every(t => t.readyState === 'ended')) tx.stream = await captureScreen(tx.displayId)
  const pc = new RTCPeerConnection({ iceServers: ICE })
  tx.peers.set(id, pc)
  for (const tr of tx.stream.getTracks()) {
    if (tr.kind === 'video') tr.contentHint = 'detail' // napisy i slajdy ostre (ruch filmu i tak płynny)
    const sender = pc.addTrack(tr, tx.stream)
    if (tr.kind === 'video') { const p = sender.getParameters(); p.encodings = [{ ...(p.encodings?.[0] || {}), maxBitrate: 8_000_000, maxFramerate: 30 }]; sender.setParameters(p).catch(() => {}) }
  }
  pc.onicecandidate = e => { if (e.candidate) tx?.sig.send({ t: 'ice', to: id, c: e.candidate.toJSON() }) }
  pc.onconnectionstatechange = () => { txCount(); if (['failed', 'closed'].includes(pc.connectionState)) { pc.close(); if (tx?.peers.get(id) === pc) tx.peers.delete(id); txCount() } }
  await pc.setLocalDescription(await pc.createOffer())
  tx.sig.send({ t: 'offer', to: id, sdp: pc.localDescription.sdp })
}
export function startShare(key, displayId) {
  stopShare()
  if (!key) return
  tx = { key, displayId, stream: null, peers: new Map(), sig: null }
  share.on = true; share.error = ''; share.key = key
  tx.sig = screenSignal(key, async m => {
    try {
      if (m.t === 'want') await txOffer(m.id)
      else if (m.t === 'answer') await tx?.peers.get(m.id)?.setRemoteDescription({ type: 'answer', sdp: m.sdp })
      else if (m.t === 'ice' && m.from) await tx?.peers.get(m.from)?.addIceCandidate(m.c)
    } catch (e) { share.error = 'Udostępnianie obrazu: ' + (e?.message || e) }
  })
  tx.sig?.send({ t: 'ready' }) // odbiorca, który już czeka, prosi od razu
}
export function stopShare() {
  if (!tx) return
  for (const pc of tx.peers.values()) pc.close()
  tx.stream?.getTracks().forEach(t => t.stop())
  tx.sig?.close()
  tx = null
  Object.assign(share, { on: false, viewers: 0 })
}

/* ---------- odbiór (laptop ze streamem) ---------- */
export const remote = reactive({ state: 'off', since: 0, error: '', step: '' }) // off | connecting | on; step — etap łączenia
let rx = null // { key, id, sig, pc, video, timer }
function rxReset() {
  if (!rx) return
  rx.pc?.close(); rx.pc = null
  remote.state = 'connecting'
  rx.onStream?.(null)
}
function rxWant() { if (rx && remote.state !== 'on') rx.sig?.send({ t: 'want', id: rx.id }) }
export function startReceive(key, onStream) {
  stopReceive()
  if (!key) return
  rx = { key, id: uid() + uid(), sig: null, pc: null, onStream }
  remote.state = 'connecting'; remote.error = ''; remote.step = 'czekam na laptop przy rzutniku (Ustawienia aplikacji → „Udostępniaj obraz rzutnika”)'
  rx.sig = screenSignal(key, async m => {
    if (!rx) return
    try {
      if (m.t === 'ready') { remote.step = 'rzutnik udostępnia — łączę…'; rxWant() }
      else if (m.t === 'offer' && m.to === rx.id) {
        remote.step = 'rzutnik odpowiedział — zestawiam połączenie…'
        rx.pc?.close()
        const pc = new RTCPeerConnection({ iceServers: ICE })
        rx.pc = pc
        pc.onicecandidate = e => { if (e.candidate) rx?.sig.send({ t: 'ice', from: rx.id, c: e.candidate.toJSON() }) }
        pc.ontrack = e => { if (rx?.pc === pc && e.streams[0]) rx.onStream?.(e.streams[0]) }
        pc.onconnectionstatechange = () => {
          if (rx?.pc !== pc) return
          if (pc.connectionState === 'connected') { remote.state = 'on'; remote.since = Date.now(); remote.step = '' }
          else if (pc.connectionState === 'failed') { remote.step = 'połączenie nie przeszło przez sieć (zapora/router) — próbuję ponownie'; rxReset() }
          else if (['disconnected', 'closed'].includes(pc.connectionState)) { remote.step = 'połączenie zerwane — łączę ponownie…'; rxReset() }
        }
        await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp })
        await pc.setLocalDescription(await pc.createAnswer())
        rx.sig.send({ t: 'answer', id: rx.id, sdp: pc.localDescription.sdp })
      } else if (m.t === 'ice' && m.to === rx.id) await rx.pc?.addIceCandidate(m.c)
    } catch (e) { remote.error = 'Obraz z rzutnika: ' + (e?.message || e) }
  })
  rxWant()
  rx.timer = setInterval(rxWant, 4000) // dopóki nie ma obrazu — co 4 s prośba (rzutnik mógł się włączyć później)
}
export function stopReceive() {
  if (!rx) return
  clearInterval(rx.timer); rx.pc?.close(); rx.sig?.close(); rx.onStream?.(null)
  rx = null
  remote.state = 'off'
}
