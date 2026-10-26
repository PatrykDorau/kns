// Rzutnik → Stream na innym komputerze bez przesyłania obrazu: Stream pokazuje w scenie „Rzutnik” (i w okienku „Rzutnik”)
// ten sam materiał z własnej kopii, sterowany przez rzutnik.
//   • Pliki: rzutnik w tle wysyła zdjęcia i filmy ze swojej biblioteki (także slajdy prezentacji) do folderu
//     „rzutnik-pliki” na Dysku Google; Stream pobiera je z wyprzedzeniem do pamięci podręcznej.
//   • Co widać: kanał na żywo bazy „rzutnik-<klucz napisów>” — { t: 'show', kind, file, playing, time, at, text, style }
//     i lista plików { t: 'files', list } (Stream pobiera brakujące). Działa w każdej sieci — wystarczy internet.
//   • Film: Stream gra swoją kopię bez dźwięku (dźwięk filmu przychodzi z konsoli), zgrany z rzutnikiem co do sekundy.
// Rzutnik nadaje po włączeniu „Materiały dla Streamu” (Ustawienia aplikacji → Dla streamu); Stream odbiera,
// gdy rzutnik jest na innym laptopie (Ustawienia nadawania → Rzutnik jest: Inny laptop).
import { watch } from 'vue'
import { api, hidden, items, liveChannel, liveSlide, settings, video } from '@/stores'
import { studio } from '@/services/studio'
import { lyricsKey } from '@/services/lyricsFeed'

const mediaUrl = p => 'media://local/' + encodeURIComponent(p)
const local = p => typeof p === 'string' && p && !/^https?:\/\//.test(p)

/* ---------- rzutnik: nadawanie ---------- */
const names = new Map<string, string>() // ścieżka → nazwa pliku na Dysku (odcisk)
async function nameOf(paths: string[]) {
  const miss = paths.filter(p => local(p) && !names.has(p))
  if (miss.length) { const r = (await api.mirrorNames(miss).catch(() => ({}))) || {}; for (const [p, n] of Object.entries(r)) names.set(p, n as string) }
}
const libFiles = () => items.value.filter(i => !i.lib && !i.missing && (i.type === 'image' || i.type === 'video') && local(i.path)).map(i => i.path)
const sending = () => !!settings.lyricsKey && !!settings.mirrorStream

let out = null, outKey = ''
const uploaded = new Set<string>(), failed = new Map<string, number>()
let uploading = false
// wysyłanie po kolei: najpierw to, co jest na rzutniku, potem reszta biblioteki
async function pump() {
  if (uploading || !sending()) return
  uploading = true
  try {
    for (;;) {
      const live = liveSlide.value?.path
      const paths = [live, ...libFiles()].filter(local)
      await nameOf(paths)
      const next = paths.find(p => names.has(p) && !uploaded.has(names.get(p)) && Date.now() - (failed.get(p) || 0) > 60000)
      if (!next || !sending()) break
      const r = await api.mirrorUpload(next, names.get(next)).catch(e => ({ error: e.message }))
      if (r?.error) { failed.set(next, Date.now()); if (r.needLogin) break } else uploaded.add(names.get(next))
      sendFiles()
    }
  } finally { uploading = false }
}
async function showMsg() {
  const v = liveSlide.value
  if (!v || hidden.value) return { t: 'show', kind: 'none' }
  if ((v.type === 'image' || v.type === 'video') && local(v.path)) {
    await nameOf([v.path])
    return { t: 'show', kind: v.type, file: names.get(v.path) || '', fit: v.fit || 'contain', playing: !video.value.paused, time: video.value.time || 0, at: Date.now() }
  }
  if (v.type === 'text') return { t: 'show', kind: 'text', text: v.text || '', style: { bg: v.bg, color: v.color, fs: v.fs, align: v.align, valign: v.valign, shadow: v.shadow } }
  return { t: 'show', kind: 'none' }
}
async function sendShow() { if (out) out.send(await showMsg()) }
function sendFiles() { if (out) out.send({ t: 'files', list: [...uploaded] }) }
function onOut(m) { if (m?.t === 'hello') { sendShow(); sendFiles() } }

/* ---------- Stream: odbiór ---------- */
let inn = null, innKey = '', latest = 0
const cached = new Map<string, string>() // nazwa → ścieżka w pamięci podręcznej
const queue: string[] = []
let fetching = false
async function fetchFile(name: string): Promise<string> {
  if (cached.has(name)) return cached.get(name)
  const r = await api.mirrorFetch(name).catch(() => null)
  if (r?.path) { cached.set(name, r.path); return r.path }
  return ''
}
async function prefetch() {
  if (fetching) return
  fetching = true
  try { while (queue.length) { const n = queue.shift(); if (!cached.has(n)) await fetchFile(n) } } finally { fetching = false }
}
async function onShow(m) {
  if (m?.t === 'files') { for (const n of m.list || []) if (!cached.has(n) && !queue.includes(n)) queue.push(n); prefetch(); return }
  if (m?.t !== 'show') return
  const my = ++latest
  if (m.kind === 'text') { studio.projector = { kind: 'text', text: m.text, style: m.style || {}, remote: true }; return }
  if ((m.kind === 'image' || m.kind === 'video') && m.file) {
    let path = cached.get(m.file)
    if (!path) {
      studio.projector = { kind: 'loading', remote: true }
      path = await fetchFile(m.file)
      if (my !== latest) return // w międzyczasie rzutnik pokazał coś innego
      if (!path) { studio.projector = { kind: 'loading', remote: true, missing: true }; return }
    }
    studio.projector = { kind: m.kind, url: mediaUrl(path), fit: m.fit, playing: !!m.playing, time: m.time || 0, at: m.at || Date.now(), remote: true }
    return
  }
  studio.projector = { kind: 'none', remote: true }
}

let started = false
export function startProjectorMirror() {
  if (started) return
  started = true
  // rzutnik: kanał i nadawanie tego, co widać (zdjęcie, film — start/pauza/przewinięcie, tekst, pieśń)
  watch(() => (sending() ? settings.lyricsKey : ''), key => {
    if (key === outKey) return
    out?.close(); out = null; outKey = key
    if (key) { out = liveChannel('rzutnik', key, onOut); sendShow(); pump() }
  }, { immediate: true })
  watch([() => liveSlide.value, hidden, () => video.value.paused, () => Math.floor((video.value.time || 0) / 5)], () => { sendShow(); pump() })
  watch(() => items.value.length, () => setTimeout(pump, 2000))
  setInterval(() => { if (!out && outKey) out = liveChannel('rzutnik', outKey, onOut); pump() }, 60000) // baza gotowa później, ponowienia
  setTimeout(() => { if (sending()) api.mirrorClean?.().catch(() => {}) }, 120000) // stare pliki z Dysku (> 7 dni)

  // Stream: rzutnik na innym laptopie (ten sam klucz co napisy)
  watch([() => settings.streamLyrics, lyricsKey], ([mode, key]) => {
    const want = mode === 'remote' && key && key !== settings.lyricsKey ? key : ''
    if (want === innKey) return
    inn?.close(); inn = null; innKey = want
    if (!want && studio.projector?.remote) studio.projector = { kind: 'none' }
    if (want) { inn = liveChannel('rzutnik', want, onShow); inn?.send({ t: 'hello' }) }
  }, { immediate: true })
  setInterval(() => { if (!inn && innKey) { inn = liveChannel('rzutnik', innKey, onShow); inn?.send({ t: 'hello' }) } else inn?.send({ t: 'hello' }) }, 30000)
}
