// Dźwięk: ATEM + filmy ze scen → PCM 48 kHz do FFmpeg; miernik poziomu i wykrywanie ciszy.
import { api } from '@/stores'
import { studio } from './state'

let meter: AnalyserNode = null
let ac: AudioContext = null, mix: GainNode = null, worklet: AudioWorkletNode = null, micSource: MediaStreamAudioSourceNode = null, micStream: MediaStream = null, mediaSources = new WeakSet()
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
export async function audioGraph() {
  if (ac) return
  ac = new AudioContext({ sampleRate: 48000 })
  mix = ac.createGain()
  // cisza jako stałe źródło — dźwięk płynie także bez mikrofonu
  const silence = ac.createConstantSource(); silence.offset.value = 0; silence.connect(mix); silence.start()
  await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })))
  worklet = new AudioWorkletNode(ac, 'pcm', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' })
  worklet.port.onmessage = e => { if (studio.live) api.studioAudio(new Uint8Array(e.data)) }
  mix.connect(worklet)
  // poziom dźwięku (miernik na pulpicie i ostrzeżenie o ciszy)
  meter = ac.createAnalyser(); meter.fftSize = 1024; mix.connect(meter)
  const buf = new Float32Array(meter.fftSize)
  let quietSince = performance.now()
  setInterval(() => {
    meter.getFloatTimeDomainData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
    const db = peak > 0 ? Math.max(-100, Math.round(20 * Math.log10(peak))) : -100
    studio.audioDb = db
    if (db > -55) quietSince = performance.now()
    studio.silentFor = Math.floor((performance.now() - quietSince) / 1000)
  }, 250)
}
export function connectMedia(el) {
  audioGraph().then(() => { if (mediaSources.has(el)) return; mediaSources.add(el); ac.createMediaElementSource(el).connect(mix) })
}
export async function setAudio(deviceId) {
  studio.audio = deviceId || ''
  await audioGraph()
  // Także w trakcie transmisji: nowe źródło otwierane, zanim odepniemy stare — dźwięk płynie bez przerwy
  // (mikser ma stałe źródło ciszy, więc nawet chwila bez mikrofonu nie zrywa strumienia do YouTube).
  const oldSource = micSource, oldStream = micStream
  const drop = () => { oldSource?.disconnect(); oldStream?.getTracks().forEach(tr => tr.stop()) }
  micSource = null; micStream = null
  if (!deviceId) { drop(); return }
  try {
    // dźwięk z miksera bez „poprawiania” (bez tłumienia echa i szumów)
    const st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 }, video: false })
    if (studio.audio !== deviceId) { st.getTracks().forEach(tr => tr.stop()); return } // w międzyczasie wybrano inne
    micStream = st
    micSource = ac.createMediaStreamSource(st)
    micSource.connect(mix)
    if (studio.error.startsWith('Nie mogę otworzyć dźwięku')) studio.error = ''
  } catch (e) { studio.error = 'Nie mogę otworzyć dźwięku: ' + (e?.message || e) }
  drop()
}
// przed nadawaniem: graf dźwięku gotowy i działający
export async function resumeAudio() {
  await audioGraph()
  if (ac.state === 'suspended') await ac.resume()
}
// stan dźwięku (konsola i testy)
export const audioInfo = () => ({ state: ac?.state || 'brak', rate: ac?.sampleRate, mic: micStream?.getAudioTracks().map(t => t.label + ' · ' + t.readyState + (t.muted ? ' · wyciszony' : '')) || [], settings: micStream?.getAudioTracks()[0]?.getSettings() })
