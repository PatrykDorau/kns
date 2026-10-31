// Rzutnik → Stream na innym komputerze bez przesyłania obrazu: Stream pokazuje w scenie „Rzutnik” (i w okienku „Rzutnik”)
// ten sam materiał z własnej kopii, sterowany przez rzutnik.
//   • Pliki: rzutnik w tle wysyła zdjęcia i filmy ze swojej biblioteki (także slajdy prezentacji) do folderu
//     „rzutnik-pliki” na Dysku Google; Stream pobiera je z wyprzedzeniem do pamięci podręcznej.
//   • Co widać: kanał na żywo bazy „rzutnik-<klucz napisów>” — { t: 'show', kind, file, playing, time, at, text, style }
//     i lista plików { t: 'files', list } (Stream pobiera brakujące). Działa w każdej sieci — wystarczy internet.
//   • Film: Stream gra swoją kopię bez dźwięku (dźwięk filmu przychodzi z konsoli), zgrany z rzutnikiem co do sekundy.
// Rzutnik nadaje po włączeniu „Materiały dla Streamu” (Ustawienia aplikacji → Dla streamu); Stream odbiera,
// gdy rzutnik jest na innym laptopie (Ustawienia nadawania → Rzutnik jest: Inny laptop).
//   • W trakcie transmisji nowe pliki czekają na decyzję (zakładka „Z rzutnika”), a pobieranie jest przycięte — internet
//     ma zostać dla streamu. Przed transmisją i po niej pobierają się same.
import { reactive, watch } from 'vue'
import { api, hidden, items, label, liveChannel, liveSlide, settings, video } from '@/stores'
import { studio } from '@/services/studio'
import { lyricsKey } from '@/services/lyricsFeed'

const mediaUrl = p => 'media://local/' + encodeURIComponent(p)
const local = p => typeof p === 'string' && p && !/^https?:\/\//.test(p)

/* ---------- rzutnik: nadawanie ---------- */
const names = new Map<string, string>() // ścieżka → nazwa pliku na Dysku (odcisk)
const about = new Map<string, { label: string, size: number, kind: string }>() // nazwa na Dysku → co to za plik
async function nameOf(paths: string[]) {
  const miss = paths.filter(p => local(p) && !names.has(p))
  if (!miss.length) return
  const r = (await api.mirrorNames(miss).catch(() => ({}))) || {}
  for (const [p, n] of Object.entries<{ name: string, size: number }>(r)) {
    const it = items.value.find(i => i.path === p)
    names.set(p, n.name)
    about.set(n.name, { label: (it ? label(it) : p.split(/[\\/]/).pop()).slice(0, 60), size: n.size, kind: it?.type || '' })
  }
}
const libFiles = () => items.value.filter(i => !i.lib && !i.missing && (i.type === 'image' || i.type === 'video') && local(i.path)).map(i => i.path)
const sending = () => !!settings.lyricsKey && !!settings.mirrorStream

let out = null, outKey = ''
const uploaded = new Set<string>(), failed = new Map<string, number>()
let uploading = false, sendingNow = null
let liveOnly = false // Stream usunął pliki po nabożeństwie — biblioteki nie wysyłamy od nowa, tylko to, co pokazujemy
// wysyłanie po kolei: najpierw to, co jest na rzutniku, potem reszta biblioteki
async function pump() {
  if (uploading || !sending()) return
  uploading = true
  try {
    for (;;) {
      const live = liveSlide.value?.path
      const paths = (liveOnly ? [live] : [live, ...libFiles()]).filter(local)
      await nameOf(paths)
      const todo = paths.filter(p => names.has(p) && !uploaded.has(names.get(p)) && Date.now() - (failed.get(p) || 0) > 60000)
      const next = todo[0]
      if (!next || !sending()) break
      sendingNow = { label: about.get(names.get(next))?.label || '', left: todo.length }
      sendFiles()
      const r = await api.mirrorUpload(next, names.get(next)).catch(e => ({ error: e.message }))
      if (r?.error) { failed.set(next, Date.now()); if (r.needLogin) break } else uploaded.add(names.get(next))
    }
  } finally { uploading = false; sendingNow = null; sendFiles() }
}
async function showMsg() {
  const v = liveSlide.value
  if (!v || hidden.value) return { t: 'show', kind: 'none' }
  if ((v.type === 'image' || v.type === 'video') && local(v.path)) {
    await nameOf([v.path])
    return { t: 'show', kind: v.type, label: about.get(names.get(v.path))?.label || '', file: names.get(v.path) || '', fit: v.fit || 'contain', playing: !video.value.paused, time: video.value.time || 0, at: Date.now() }
  }
  if (v.type === 'text') return { t: 'show', kind: 'text', text: v.text || '', style: { bg: v.bg, color: v.color, fs: v.fs, align: v.align, valign: v.valign, shadow: v.shadow } }
  return { t: 'show', kind: 'none' }
}
async function sendShow() { if (out) out.send(await showMsg()) }
function sendFiles() { if (out) out.send({ t: 'files', list: [...uploaded], info: Object.fromEntries([...uploaded].map(n => [n, about.get(n)])), sending: sendingNow }) }
function onOut(m) {
  if (m?.t === 'hello') { sendShow(); sendFiles() }
  else if (m?.t === 'wiped') { uploaded.clear(); liveOnly = true; sendFiles() }
  else if (m?.t === 'need') { uploaded.delete(m.file); pump() } // plik zniknął z Dysku, a Stream go potrzebuje
}

/* ---------- Stream: odbiór ---------- */
export interface ProjFile { name: string, label: string, size: number, kind: string, state: 'new' | 'queued' | 'loading' | 'done' | 'error', got: number, total: number, error: string, missing: boolean }
// pliki od rzutnika: zakładka „Z rzutnika” w studiu
export const projFiles = reactive({ list: [] as ProjFile[], sending: null as null | { label: string, left: number } })
let inn = null, innKey = ''
const cached = new Map<string, string>() // nazwa → ścieżka w pamięci podręcznej
const gone = new Set<string>() // usunięte po nabożeństwie — nie pobieramy ich same od nowa
const LIVE_LIMIT = 2e6 // w trakcie transmisji najwyżej 2 MB/s pobierania
const queue: string[] = []
let fetching = false
let lastShow = null, lastShowAt = 0 // ostatnia wiadomość „co pokazać” — wraca, gdy plik się pobierze
function fileOf(name: string) {
  let f = projFiles.list.find(x => x.name === name)
  if (!f) { projFiles.list.push({ name, label: name, size: 0, kind: '', state: 'new', got: 0, total: 0, error: '', missing: false }); f = projFiles.list.at(-1) }
  return f
}
// czekamy na decyzję: trwa transmisja, a automat w jej trakcie wyłączony
const holdBack = () => studio.live && !settings.mirrorLive
export function fetchProjFile(name: string, first = false) {
  const f = fileOf(name)
  if (cached.has(name) || f.state === 'loading' || f.state === 'queued') return
  f.state = 'queued'; f.error = ''; f.missing = false
  if (first) queue.unshift(name); else queue.push(name)
  prefetch()
}
export const fetchAllProjFiles = () => { for (const f of projFiles.list) if (f.state === 'new' || f.state === 'error') fetchProjFile(f.name) }
async function fetchFile(name: string) {
  const f = fileOf(name)
  f.state = 'loading'; f.got = 0
  const r = await api.mirrorFetch(name, { limit: studio.live ? LIVE_LIMIT : 0 }).catch(e => ({ error: e.message }))
  if (r?.path) {
    cached.set(name, r.path); f.state = 'done'
    if (lastShow?.file === name) onShow({ ...lastShow, time: (lastShow.time || 0) + (lastShow.playing ? (Date.now() - lastShowAt) / 1000 : 0) })
    return
  }
  f.state = 'error'; f.missing = !!r?.missing
  f.error = r?.missing ? 'Rzutnik jeszcze wysyła ten plik.' : r?.needLogin ? 'Zaloguj ten komputer do Google.' : r?.error || 'Nie udało się pobrać.'
  if (r?.missing) inn?.send({ t: 'need', file: name })
}
async function prefetch() {
  if (fetching) return
  fetching = true
  try { while (queue.length) await fetchFile(queue.shift()) } finally { fetching = false }
}
async function onFiles(m) {
  projFiles.sending = m.sending || null
  for (const [n, i] of Object.entries<any>(m.info || {})) if (i) Object.assign(fileOf(n), { label: i.label, size: i.size, kind: i.kind })
  const fresh = (m.list || []).filter(n => !cached.has(n) && !gone.has(n))
  if (!fresh.length) return
  const have = (await api.mirrorHave(fresh).catch(() => ({}))) || {}
  for (const n of fresh) {
    const f = fileOf(n)
    if (have[n]) { cached.set(n, have[n]); f.state = 'done' }
    else if (!holdBack() && (f.state === 'new' || f.missing)) fetchProjFile(n)
  }
}
export function onShow(m) {
  if (m?.t === 'files') { onFiles(m); return }
  if (m?.t !== 'show') return
  lastShow = m; lastShowAt = Date.now()
  if (m.kind === 'text') { studio.projector = { kind: 'text', text: m.text, style: m.style || {}, remote: true }; return }
  if ((m.kind === 'image' || m.kind === 'video') && m.file) {
    const path = cached.get(m.file)
    if (!path) {
      const f = fileOf(m.file)
      if (m.label) { f.label = m.label; f.kind = m.kind }
      gone.delete(m.file) // rzutnik znowu tego używa
      const busy = f.state === 'loading' || f.state === 'queued'
      if (!busy && holdBack()) { studio.projector = { kind: 'loading', remote: true, ask: true }; return }
      studio.projector = { kind: 'loading', remote: true, missing: f.missing }
      if (f.state === 'new') fetchProjFile(m.file, true)
      return
    }
    // czas liczony od odebrania, nie od „at” z rzutnika — zegary komputerów różnią się o sekundy (cofka po każdej pauzie)
    studio.projector = { kind: m.kind, url: mediaUrl(path), fit: m.fit, playing: !!m.playing, time: m.time || 0, at: Date.now(), remote: true }
    return
  }
  studio.projector = { kind: 'none', remote: true }
}
// Po nabożeństwie: pliki z Dysku i kopie na tym komputerze (to, co jest teraz na wizji, zostaje).
export async function wipeProjFiles() {
  const keep = lastShow?.file ? [lastShow.file] : []
  const r = await api.mirrorWipe(keep)
  if (r?.error) return r
  for (const n of cached.keys()) if (!keep.includes(n)) cached.delete(n)
  for (const f of projFiles.list) if (!keep.includes(f.name)) gone.add(f.name)
  projFiles.list = projFiles.list.filter(f => keep.includes(f.name))
  queue.length = 0
  inn?.send({ t: 'wiped' })
  return r
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
  // postęp pobierania; po transmisji albo po włączeniu automatu — to, co czekało na decyzję
  api.onMirrorProgress?.(p => { const f = projFiles.list.find(x => x.name === p.name); if (f) { f.got = p.got; f.total = p.total } })
  watch(holdBack, on => { if (!on) for (const f of projFiles.list) if (f.state === 'new') fetchProjFile(f.name) })
}
