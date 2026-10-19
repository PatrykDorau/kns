// Wspólna baza (dawniej folder wspólny): nabożeństwa i pieśni na wielu komputerach.
import { ref } from 'vue'
import { hide } from './display'
import { dropFile } from './library'
import { plain } from './lists'
import { adoptService, me, mergeSameDay, now, servicePayload } from './services'
import { BAZA, churchAnnouncements, churchEvents, churchTypes, cloud, liveId, loaded, selectedId, services, settings, shared, songs } from './state'

/* ---------- folder wspólny: te same nabożeństwa na wielu komputerach ---------- */
// Każdy komputer wskazuje ten sam folder (OneDrive, Dysk Google, dysk sieciowy…). Nabożeństwa są
// tam zapisywane jako podfoldery; aplikacja co kilkanaście sekund sprawdza, czy ktoś coś zmienił.
// Przy równoczesnej edycji wygrywa późniejszy zapis.
export const sharedStatus = ref('')
export const sharedAccount = ref(null) // { provider, email } — konto dysku, na którym leży folder (gdy da się ustalić)
export const synced = new Map() // id → stan nabożeństwa, który jest już w folderze wspólnym
export const snapshot = svc => JSON.stringify({ ...svc, updated: 0 })
export const clock = () => new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })

export const syncing = ref(false)
export let syncRun = null
// Trwająca synchronizacja nie jest uruchamiana drugi raz — wywołujący czeka na jej koniec.
export function syncShared() {
  if (syncRun) return syncRun
  syncing.value = true
  syncRun = runSync().finally(() => { syncing.value = false; syncRun = null })
  return syncRun
}
// Sprawdzanie zmian z innych komputerów i telefonów: co 2 minuty, po powrocie do okna (nie częściej
// niż co 30 s) i od razu po zapisie. Zapis nabożeństwa wysyła je od razu.
export const SYNC_EVERY = 2 * 60000
export let lastSync = 0
export function markSynced() { lastSync = Date.now() }
export function syncIfStale() {
  if (Date.now() - lastSync < 30000) return
  lastSync = Date.now()
  syncShared()
}
export async function runSync() {
  const dir = settings.sharedDir
  if (!dir || !loaded.value) return
  const res = await shared(dir).sharedRead(dir)
  googleExpired.value = !!res.needLogin
  if (dir === BAZA) sharedAccount.value = cloud.account() || sharedAccount.value
  if (res.error) { sharedStatus.value = res.error; return }
  if (res.templates !== undefined) churchTypes.value = mergeTypes(res.templates)
  if (Array.isArray(res.events)) churchEvents.value = res.events
  if (Array.isArray(res.announcements)) churchAnnouncements.value = res.announcements
  const seen = new Set()
  for (const payload of res.list) {
    const id = payload.service.id
    seen.add(id)
    const local = services.value.find(x => x.id === id)
    if (local && (local.updated || 0) >= (payload.service.updated || 0)) continue
    const svc = { ...adoptService(payload, id), shared: true }
    if (local) Object.assign(local, svc)
    else services.value.push(svc)
    synced.set(id, snapshot(services.value.find(x => x.id === id)))
  }
  mergeSameDay()
  // Nabożeństwo usunięte na innym komputerze znika też tutaj.
  for (const svc of [...services.value]) {
    if (svc.shared && !seen.has(svc.id)) { services.value.splice(services.value.indexOf(svc), 1); synced.delete(svc.id) }
  }
  await pushShared()
  await syncSongs(dir)
  if (settings.sharedDir === dir) sharedStatus.value = 'Zsynchronizowano o ' + clock()
}

/* Wspólna baza pieśni. Każda pieśń ma czas ostatniej zmiany; przy łączeniu wygrywa nowsza wersja,
   a usunięcia są zapamiętywane, żeby pieśń nie „wracała” z innego komputera. */
export const songSeen = new Map() // id → treść przy ostatnim sprawdzeniu (do wykrywania edycji)
export const songBody = s => s.number + '\n' + s.title + '\n' + s.text
export let songsDirty = true
export let songsMtime = 0
export function stampSongs() {
  const now = Date.now()
  for (const s of songs.value) {
    const body = songBody(s)
    const seen = songSeen.get(s.id)
    if (seen === body) continue
    // Edycja jest zawsze nowsza od wersji, na której powstała — także gdy zegary komputerów się różnią.
    if (seen !== undefined || !s.updated) s.updated = Math.max(now, (s.updated || 0) + 1)
    songSeen.set(s.id, body)
  }
}
// Ta sama pieśń dodana niezależnie na dwóch komputerach dostaje wspólny identyfikator.
export function changeSongId(song, id) {
  const old = song.id
  song.id = id
  songSeen.set(id, songSeen.get(old)); songSeen.delete(old)
  for (const e of settings.service) if (e.songId === old) e.songId = id
  for (const svc of services.value) for (const e of svc.songs) if (e.songId === old) e.songId = id
  if (selectedId.value === old) selectedId.value = id
  if (liveId.value === old) liveId.value = id
}
// Ta sama pieśń dwa razy (np. raz z numerem z bazy wspólnej, raz bez numeru z tego komputera):
// zostaje ta z numerem, z nowszym tekstem, a odwołania w nabożeństwach przechodzą na nią.
// Pieśni o tym samym tytule, ale różnych numerach, to różne pieśni — zostają obie.
export function mergeTwinSongs(deleted) {
  const groups = new Map()
  for (const s of songs.value) {
    const key = plain(String(s.title || '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (key) groups.set(key, [...(groups.get(key) || []), s])
  }
  let merged = 0
  for (const group of groups.values()) {
    if (group.length < 2 || new Set(group.map(s => s.number).filter(Boolean)).size > 1) continue
    group.sort((a, b) => (b.number ? 1 : 0) - (a.number ? 1 : 0) || (b.updated || 0) - (a.updated || 0) || (a.id < b.id ? -1 : 1))
    const [keep, ...rest] = group
    for (const other of rest) {
      if ((other.updated || 0) > (keep.updated || 0) && other.text !== keep.text) keep.text = other.text
      const old = other.id
      for (const e of settings.service) if (e.songId === old) e.songId = keep.id
      for (const svc of services.value) for (const e of svc.songs) if (e.songId === old) e.songId = keep.id
      if (selectedId.value === old) selectedId.value = keep.id
      if (liveId.value === old) liveId.value = keep.id
      songs.value.splice(songs.value.indexOf(other), 1)
      songSeen.delete(old)
      const at = Date.now()
      if (settings.sharedDir) settings.deletedSongs[old] = at
      if (deleted) deleted[old] = at
      merged++
    }
  }
  return merged
}
export async function syncSongs(dir) {
  stampSongs()
  const remote = await shared(dir).sharedSongsRead(dir, songsDirty ? 0 : songsMtime)
  if (remote.error || remote.unchanged) return
  const remoteSongs = remote.songs || []
  const deleted = { ...remote.deleted }
  for (const [id, at] of Object.entries(settings.deletedSongs)) if (!(deleted[id] >= at)) deleted[id] = at

  const byId = new Map(songs.value.map(s => [s.id, s]))
  const nameOf = s => (s.number || '') + '|' + s.title
  const byName = new Map(songs.value.map(s => [nameOf(s), s]))
  const remoteIds = new Set(remoteSongs.map(r => r.id))
  for (const r of remoteSongs) {
    if (deleted[r.id] >= (r.updated || 0)) continue
    let own = byId.get(r.id)
    if (!own) {
      const twin = byName.get(nameOf(r))
      if (twin && !remoteIds.has(twin.id)) { changeSongId(twin, r.id); byId.set(r.id, twin); own = twin }
    }
    if (!own) {
      own = { id: r.id, type: 'song', number: r.number || '', title: r.title, text: r.text, updated: r.updated || 0 }
      songs.value.push(own)
    } else if ((r.updated || 0) > (own.updated || 0)) {
      Object.assign(own, { number: r.number || '', title: r.title, text: r.text, updated: r.updated })
    } else continue
    songSeen.set(own.id, songBody(own))
  }
  if (mergeTwinSongs(deleted)) stampSongs()
  for (const s of [...songs.value]) {
    if (!(deleted[s.id] >= (s.updated || 0))) continue
    if (s.id === liveId.value) hide()
    if (s.id === selectedId.value) selectedId.value = null
    songs.value.splice(songs.value.indexOf(s), 1)
    settings.service = settings.service.filter(e => e.songId !== s.id)
  }

  const mine = songs.value.map(({ id, number, title, text, updated }) => ({ id, number, title, text, updated: updated || 0 }))
  const order = list => JSON.stringify([...list].sort((a, b) => (a.id < b.id ? -1 : 1)))
  const same = order(mine) === order(remoteSongs.map(({ id, number, title, text, updated }) => ({ id, number: number || '', title, text, updated: updated || 0 }))) &&
    JSON.stringify(deleted) === JSON.stringify(remote.deleted || {})
  if (same) { songsMtime = remote.mtime; songsDirty = false; return }
  const res = await shared(dir).sharedSongsWrite(dir, { songs: mine, deleted })
  if (res.error) { sharedStatus.value = res.error; return }
  songsMtime = res.mtime
  songsDirty = false
}
export let songSyncTimer = null
export function songsChanged() {
  songsDirty = true
  if (!settings.sharedDir) return
  clearTimeout(songSyncTimer)
  songSyncTimer = setTimeout(syncShared, 3000)
}

export let pushing = false
export async function pushShared() {
  const dir = settings.sharedDir
  if (!dir || !loaded.value || pushing) return
  pushing = true
  try {
    for (const svc of services.value) {
      if (synced.get(svc.id) === snapshot(svc)) continue
      svc.updated = Date.now()
      svc.updatedBy = me()
      const res = await shared(dir).sharedWrite(dir, servicePayload(svc))
      if (res.error) { sharedStatus.value = res.error; return }
      // Załączniki leżą odtąd w folderze wspólnym — lokalna kopia nie jest już potrzebna.
      for (const f of svc.files) {
        const moved = res.files.find(x => x.key === f.key)
        if (moved && moved.path !== f.path) { const old = f.path; f.path = moved.path; dropFile(old) }
      }
      svc.shared = true
      synced.set(svc.id, snapshot(svc))
      sharedStatus.value = res.warning || 'Zapisano o ' + clock()
    }
  } finally {
    pushing = false
  }
}
export let pushTimer = null
export function pushSoon() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(pushShared, 1500)
}

// Po zmianie folderu wszystko, co jest na tym komputerze, trafia do nowego folderu — a nie zostaje
// uznane za „usunięte gdzie indziej”, bo w nowym folderze jeszcze tego nie ma.
export function forgetShared() {
  synced.clear()
  songsMtime = 0
  songsDirty = true
  for (const svc of services.value) delete svc.shared
}
export const sharedSuggestions = ref([]) // znalezione na tym komputerze foldery aplikacji
export const googleError = ref('') // ostatni błąd logowania — zostaje widoczny, bo użytkownik jest wtedy w przeglądarce
export const googleExpired = ref(false) // logowanie do Dysku Google wygasło (tryb testowy Google: co 7 dni)
