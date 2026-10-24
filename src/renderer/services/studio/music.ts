// Podkład muzyczny na transmisji (np. własne nagrania KNS Music): lista plików MP3/M4A/WAV (albo MP4 — sam dźwięk),
// odtwarzanie w tle do miksu transmisji z własną głośnością i płynnym wyciszaniem. Lokalnie nic nie gra
// (dźwięk idzie tylko do transmisji — bez sprzężenia z nagłośnieniem).
import { reactive } from 'vue'
import { api, settings, uid } from '@/stores'
import { musicNode } from './audio'

// all — gra cała lista (po utworze następny; na końcu stop, chyba że „W kółko”)
export const music = reactive({ current: '', playing: false, time: 0, duration: 0, error: '', all: false })
let el: HTMLAudioElement = null
let gain: GainNode = null
let ctx: AudioContext = null
let stopTimer = 0
const url = p => 'media://local/' + encodeURIComponent(p)
const vol = () => Math.max(0, Math.min(1, +settings.musicVolume || 0))

async function ensure() {
  if (el) return
  el = new Audio()
  el.crossOrigin = 'anonymous'
  el.preload = 'auto'
  el.addEventListener('timeupdate', () => { music.time = el.currentTime; music.duration = el.duration || 0 })
  el.addEventListener('play', () => { music.playing = true })
  el.addEventListener('pause', () => { music.playing = false })
  el.addEventListener('ended', () => { music.playing = false; if (music.all || settings.musicLoop) next(true) })
  el.addEventListener('error', () => { music.error = 'Nie mogę odtworzyć pliku — sprawdź, czy jeszcze istnieje.'; music.playing = false })
  ;({ gain, ctx } = await musicNode(el))
}
function rampTo(v: number, sec: number) {
  if (!gain) return
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(v, t + Math.max(0.05, sec))
}

// dodanie plików (kopiowane do folderu aplikacji)
export async function addMusic() {
  const files = await api.pickMusic()
  for (const f of files || []) settings.musicList.push({ id: uid(), name: f.name, path: f.path })
}
export function removeMusic(id: string) {
  if (music.current === id) stopMusic(0)
  const i = settings.musicList.findIndex(x => x.id === id)
  if (i >= 0) { const [f] = settings.musicList.splice(i, 1); api.removeFile(f.path) }
}
// odtwórz utwór (płynne wejście)
export async function playMusic(id: string, fadeIn = 2) {
  const t = settings.musicList.find(x => x.id === id)
  if (!t) return
  await ensure()
  clearTimeout(stopTimer)
  music.error = ''
  if (music.current !== id) { el.src = url(t.path); music.current = id }
  gain.gain.setValueAtTime(0, ctx.currentTime)
  try { await el.play() } catch (e) { music.error = 'Nie mogę odtworzyć: ' + (e?.message || e); return }
  rampTo(vol(), fadeIn)
}
// pauza / wznowienie
export function toggleMusic() {
  if (!el || !music.current) { if (settings.musicList[0]) playMusic(music.current || settings.musicList[0].id); return }
  if (el.paused) playMusic(music.current, 1)
  else stopMusic(1.5, false)
}
// zatrzymanie z płynnym wyciszeniem (fade — sekundy); rewind: od początku przy następnym odtworzeniu
export function stopMusic(fade = 3, rewind = true) {
  if (!el) return
  if (rewind) music.all = false
  rampTo(0, fade)
  clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => { el.pause(); if (rewind) el.currentTime = 0 }, fade * 1000 + 50)
}
export function nextMusic() { next() }
// Odtwórz wszystkie: od pierwszego (albo losowego) utworu, potem kolejne.
export function playAllMusic() {
  const list = settings.musicList
  if (!list.length) return
  music.all = true
  playMusic(settings.musicShuffle ? list[Math.floor(Math.random() * list.length)].id : list[0].id)
}
// auto — po skończonym utworze: na końcu listy stop (chyba że w kółko)
function next(auto = false) {
  const list = settings.musicList
  if (!list.length) return
  const i = list.findIndex(x => x.id === music.current)
  if (settings.musicShuffle && list.length > 1) { const others = list.filter(x => x.id !== music.current); playMusic(others[Math.floor(Math.random() * others.length)].id, 1); return }
  if (auto && i === list.length - 1 && !settings.musicLoop) { music.all = false; return }
  const n = list[(i + 1) % list.length]
  if (n.id === music.current && el) { el.currentTime = 0; el.play().catch(() => {}); return }
  playMusic(n.id, 1)
}
export function setMusicVolume(v: number) {
  settings.musicVolume = v
  if (gain && el && !el.paused) rampTo(vol(), 0.2)
}
