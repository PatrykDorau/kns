// Podkład muzyczny na transmisji (np. własne nagrania KNS Music): lista plików MP3/M4A/WAV (albo MP4 — sam dźwięk)
// i filmów z YouTube (ukryty odtwarzacz, ytPlayer.ts), odtwarzanie w tle do miksu transmisji z własną głośnością i płynnym wyciszaniem. Lokalnie nic nie gra
// (dźwięk idzie tylko do transmisji — bez sprzężenia z nagłośnieniem).
import { reactive } from 'vue'
import { api, settings, uid } from '@/stores'
import { musicNode, musicStreamNode, voiceDb } from './audio'

// all — gra cała lista (po utworze następny; na końcu stop, chyba że „W kółko”)
export const music = reactive({ current: '', playing: false, time: 0, duration: 0, error: '', all: false, ducked: false })
let el: HTMLAudioElement = null
let gain: GainNode = null // głośność tego, co teraz gra (plik albo YouTube)
let elGain: GainNode = null, ytGain: GainNode = null
let ctx: AudioContext = null
let stopTimer = 0, ytTimer = 0
let onYt = false // obecny utwór gra z YouTube
const url = p => 'media://local/' + encodeURIComponent(p)
const DUCK = 0.25 // tyle głośności zostaje pod mową
const vol = () => Math.max(0, Math.min(1, +settings.musicVolume || 0)) * (music.ducked ? DUCK : 1)
// Ściszanie pod mową: mikrofon głośniejszy od progu przez chwilę → podkład cichnie; po 1,5 s ciszy wraca.
// Mowa ma przerwy, więc liczą się dwa głośne odczyty w ciągu sekundy, a nie ciągły dźwięk.
let fading = false, duckTimer = 0, heard: number[] = []
function duckTick() {
  const on = settings.musicDuck && music.playing && !fading, now = performance.now()
  if (!on) { heard = []; if (music.ducked) { music.ducked = false; if (music.playing && !fading) rampTo(vol(), 0.5) } return }
  heard = heard.filter(t => now - t < 1500)
  if (voiceDb() > (settings.musicDuckDb ?? -38)) heard.push(now)
  if (!music.ducked && heard.filter(t => now - t < 1000).length >= 2) { music.ducked = true; rampTo(vol(), 0.4) }
  else if (music.ducked && !heard.length) { music.ducked = false; rampTo(vol(), 1.2) }
}
export function startDuck() { if (!duckTimer) duckTimer = window.setInterval(duckTick, 100) }

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
  ;({ gain: elGain, ctx } = await musicNode(el))
}
// Dźwięk z odtwarzacza YouTube: jedno przechwycenie na całą pracę aplikacji, kolejne filmy płyną tą samą drogą.
async function ensureYt() {
  if (ytGain) return
  await api.ytpArm()
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints })
  stream.getVideoTracks().forEach(tr => tr.stop())
  const track = stream.getAudioTracks()[0]
  if (!track) throw new Error('nie ma dźwięku z odtwarzacza')
  track.addEventListener('ended', () => { ytGain = null })
  ;({ gain: ytGain, ctx } = await musicStreamNode(stream))
}
function watchYt() {
  clearInterval(ytTimer)
  ytTimer = window.setInterval(async () => {
    const s = await api.ytpState()
    if (!onYt) return
    if (s.error) { music.error = s.error; music.playing = false; clearInterval(ytTimer); if (music.all) next(true); return }
    if (!s.ready) return
    music.time = s.time; music.duration = s.duration; music.playing = s.playing
    if (s.ad) music.error = 'YouTube puszcza reklamę — słychać ją na transmisji.'
    else if (/reklam/.test(music.error)) music.error = ''
    if (s.ended) { clearInterval(ytTimer); music.playing = false; if (music.all || settings.musicLoop) next(true) }
  }, 500)
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
  if (i >= 0) { const [f] = settings.musicList.splice(i, 1); if (f.path) api.removeFile(f.path) }
}
// Playlista z YouTube: link albo id; utwory dopisują się do listy, te już dodane są pomijane.
export async function addPlaylist(linkOrId: string) {
  const id = String(linkOrId).match(/[?&]list=([\w-]+)/)?.[1] || String(linkOrId).trim()
  const res = await api.ytPlaylist(id)
  if (res?.error) return { error: res.error }
  const fresh = res.videos.filter(v => !settings.musicList.some(t => t.yt === v.id))
  for (const v of fresh) settings.musicList.push({ id: uid(), name: v.title, path: '', yt: v.id, link: 'https://youtu.be/' + v.id })
  return { added: fresh.length, all: res.videos.length }
}
// odtwórz utwór (płynne wejście)
export async function playMusic(id: string, fadeIn = 2) {
  const t = settings.musicList.find(x => x.id === id)
  if (!t) return
  clearTimeout(stopTimer)
  fading = false
  startDuck()
  music.error = ''
  const same = music.current === id
  try {
    if (t.yt) {
      await ensureYt()
      el?.pause()
      gain = ytGain; onYt = true
      gain.gain.setValueAtTime(0, ctx.currentTime)
      music.current = id
      if (same) await api.ytpResume(); else { music.time = 0; music.duration = 0; await api.ytpPlay(t.yt) }
      watchYt()
    } else {
      await ensure()
      if (onYt) { onYt = false; clearInterval(ytTimer); api.ytpPause() }
      gain = elGain
      if (!same) { el.src = url(t.path); music.current = id }
      gain.gain.setValueAtTime(0, ctx.currentTime)
      await el.play()
    }
  } catch (e) { music.error = 'Nie mogę odtworzyć: ' + (e?.message || e); return }
  rampTo(vol(), fadeIn)
}
// pauza / wznowienie
export function toggleMusic() {
  if (!music.current) { if (settings.musicList[0]) playMusic(settings.musicList[0].id); return }
  if (!music.playing) playMusic(music.current, 1)
  else stopMusic(1.5, false)
}
// zatrzymanie z płynnym wyciszeniem (fade — sekundy); rewind: od początku przy następnym odtworzeniu
export function stopMusic(fade = 3, rewind = true) {
  if (!music.current) return
  if (rewind) music.all = false
  fading = true
  rampTo(0, fade)
  clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => {
    if (onYt) { api.ytpPause(); if (rewind) api.ytpSeek(0); music.playing = false; return }
    el.pause(); if (rewind) el.currentTime = 0
  }, fade * 1000 + 50)
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
  if (n.id === music.current) { if (onYt) { api.ytpSeek(0); api.ytpResume(); watchYt() } else if (el) { el.currentTime = 0; el.play().catch(() => {}) } return }
  playMusic(n.id, 1)
}
// Tytuł i wykonawca do plakietki: wpisane ręcznie, inaczej z nazwy. „Tytuł (Oryginał-Autor)” to cover, więc w nawiasie jest
// pierwotny wykonawca, a gra KNS Music; „Tytuł - Wykonawca” podaje wykonawcę wprost.
const OWN_ARTIST = 'KNS Music'
export function trackInfo(t: { name: string; title?: string; artist?: string; link?: string; yt?: string }) {
  const name = (t.yt ? String(t.name) : String(t.name).replace(/\.[^.]+$/, '')).trim()
  const cover = name.match(/^(.+?)\s*\([^()]*?\s*[-–—]\s*[^()]+?\s*\)/), plain = name.match(/^(.+?)\s+[-–—|]\s+(.+)$/)
  return { title: t.title?.trim() || cover?.[1].trim() || plain?.[1].trim() || name, artist: t.artist?.trim() || (!cover && plain?.[2].trim()) || OWN_ARTIST, link: t.link || '' }
}
// Link do filmu: krótki adres (mniejszy kod QR); zły link — pusty.
export function ytLink(s: string) {
  const v = String(s || '').trim(), id = v.match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/shorts\/)([\w-]{11})/)?.[1]
  return id ? 'https://youtu.be/' + id : /^https?:\/\//.test(v) ? v : ''
}
const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '')
// Linki do utworów bez linku: film o tej samej nazwie co plik albo zaczynający się od tytułu (krótkie tytuły tylko dokładnie).
export async function findMusicLinks() {
  const res = await api.ytVideos()
  if (res?.error) return { error: res.error }
  const videos = res.videos.map(v => ({ id: v.id, key: key(v.title) })).sort((a, b) => a.key.length - b.key.length)
  const missing = settings.musicList.filter(t => !t.link)
  let found = 0
  for (const t of missing) {
    const whole = key(String(t.name).replace(/\.[^.]+$/, '')), title = key(trackInfo(t).title)
    const v = videos.find(x => x.key === whole) || (title.length >= 6 ? videos.find(x => x.key.startsWith(title)) : null)
    if (v) { t.link = 'https://youtu.be/' + v.id; found++ }
  }
  return { found, missing: missing.length }
}
export function setMusicVolume(v: number) {
  settings.musicVolume = v
  if (gain && music.playing) rampTo(vol(), 0.2)
}
