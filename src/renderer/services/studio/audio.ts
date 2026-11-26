// Dźwięk: ATEM + filmy ze scen → PCM 48 kHz do FFmpeg; miernik poziomu i wykrywanie ciszy.
import { api, settings } from '@/stores'
import { studio } from './state'

let meter: AnalyserNode = null
let voice: AnalyserNode = null
let micGain: GainNode = null
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
  voice = ac.createAnalyser(); voice.fftSize = 2048
  // wzmocnienie wejścia (suwak przy mierniku): mikser → wzmocnienie → miks
  micGain = ac.createGain(); micGain.gain.value = dbToGain(settings.studioGain || 0); micGain.connect(mix); micGain.connect(voice)
  const buf = new Float32Array(meter.fftSize)
  let quietSince = performance.now(), holdAt = 0
  // co 80 ms: szczyt (miernik), szczyt zapamiętany na 1,5 s, przester (≥ −1 dBFS — zostaje zapalony 3 s)
  setInterval(() => {
    meter.getFloatTimeDomainData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
    const db = peak > 0 ? Math.max(-100, Math.round(20 * Math.log10(peak) * 10) / 10) : -100
    const now = performance.now()
    studio.audioDb = db
    if (db >= studio.audioPeak || now - holdAt > 1500) { studio.audioPeak = db; holdAt = now }
    if (db >= -1) studio.clipAt = Date.now()
    if (db > -55) quietSince = now
    studio.silentFor = Math.floor((now - quietSince) / 1000)
  }, 80)
}
export function connectMedia(el) {
  audioGraph().then(() => { if (mediaSources.has(el)) return; mediaSources.add(el); ac.createMediaElementSource(el).connect(mix) })
}
// podkład muzyczny (music.ts): element <audio> → własna głośność → miks transmisji
export async function musicNode(el: HTMLMediaElement) {
  await audioGraph()
  const gain = ac.createGain(); gain.gain.value = 0
  ac.createMediaElementSource(el).connect(gain); gain.connect(mix)
  return { gain, ctx: ac }
}
// podkład z YouTube: przechwycony dźwięk odtwarzacza → własna głośność → miks transmisji
export async function musicStreamNode(stream: MediaStream) {
  await audioGraph()
  const gain = ac.createGain(); gain.gain.value = 0
  ac.createMediaStreamSource(stream).connect(gain); gain.connect(mix)
  return { gain, ctx: ac }
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
    micSource.connect(micGain)
    if (studio.error.startsWith('Nie mogę otworzyć dźwięku')) studio.error = ''
  } catch (e) { studio.error = 'Nie mogę otworzyć dźwięku: ' + (e?.message || e) }
  drop()
}
const dbToGain = (db: number) => Math.pow(10, (Math.max(-24, Math.min(24, +db || 0))) / 20)
// Wzmocnienie wejścia w dB (−24…+24) — także w trakcie transmisji, płynnie.
export function setGain(db: number) {
  settings.studioGain = Math.max(-24, Math.min(24, Math.round(+db || 0)))
  if (micGain && ac) micGain.gain.setTargetAtTime(dbToGain(settings.studioGain), ac.currentTime, 0.05)
}
// Poziom samego mikrofonu w dB (bez podkładu) — do ściszania muzyki pod mową.
export function voiceDb() {
  if (!micSource || !voice) return -100
  const buf = new Float32Array(voice.fftSize)
  voice.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  return rms > 0 ? 20 * Math.log10(rms) : -100
}
// przed nadawaniem: graf dźwięku gotowy i działający
export async function resumeAudio() {
  await audioGraph()
  if (ac.state === 'suspended') await ac.resume()
}
// stan dźwięku (konsola i testy)
export const audioInfo = () => ({ state: ac?.state || 'brak', rate: ac?.sampleRate, mic: micStream?.getAudioTracks().map(t => t.label + ' · ' + t.readyState + (t.muted ? ' · wyciszony' : '')) || [], settings: micStream?.getAudioTracks()[0]?.getSettings() })
