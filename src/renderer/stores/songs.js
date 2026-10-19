// Pieśni: lista na nabożeństwo, dodawanie i import (pliki, folder, Dysk Google).
import { remove } from './library'
import { serviceList } from './lists'
import { api, busy, search, selectedId, settings, songs, tab, uid } from './state'

/* ---------- pieśni ---------- */
export function addToService(song) {
  settings.service.push({ key: uid(), songId: song.id })
  search.service = ''
  tab.value = 'songs'
  selectedId.value = song.id
}
export function removeFromService(i) {
  const entry = serviceList.value[i]
  settings.service = settings.service.filter(e => e.key !== entry.key)
}
export function moveInService(from, to) {
  const keys = serviceList.value.map(e => e.key)
  keys.splice(to, 0, ...keys.splice(from, 1))
  settings.service = keys.map(key => settings.service.find(e => e.key === key))
}
export function clearService() { settings.service = [] }

export function addSong() {
  const song = { id: uid(), type: 'song', number: '', title: '', text: '' }
  songs.value.push(song)
  search.songs = ''
  return song
}

// Wczytuje pieśni z plików lub folderu, ale ich nie zapisuje — trafiają do wersji roboczej w oknie bazy.
// Pieśni z folderu na Dysku Google (np. cała baza z OpenSong).
export async function songsFromDrive(link) {
  const off = api.onSongsDriveProgress(p => { busy.value = `Pobieram pieśni z Dysku Google: ${p.done} z ${p.total}…` })
  busy.value = 'Szukam pieśni w folderze na Dysku Google…'
  try {
    const res = await api.songsFromDrive(link)
    if (res.error) return { error: res.error, songs: [], skipped: 0 }
    return parseSongFiles(res.files)
  } finally { off(); busy.value = '' }
}
export async function parseSongFiles(files) {
  const found = []
  let skipped = 0
  if (files.length) {
    const { parseSongFile } = await import('@/services/songImport')
    for (const f of files) {
      const list = parseSongFile(f.name, f.content)
      if (!list.length) skipped++
      found.push(...list.map(x => ({ id: uid(), type: 'song', ...x })))
    }
  }
  return { songs: found, skipped }
}
export async function pickSongs(folder) {
  const files = await api.pickSongFiles(folder)
  const found = []
  let skipped = 0
  if (files.length) {
    const { parseSongFile } = await import('@/services/songImport')
    for (const f of files) {
      const list = parseSongFile(f.name, f.content)
      if (!list.length) skipped++
      found.push(...list.map(x => ({ id: uid(), type: 'song', ...x })))
    }
  }
  return { songs: found, skipped }
}

// Zapis z okna bazy pieśni: tylko to, co użytkownik faktycznie zmienił od otwarcia okna.
export function applySongChanges({ added, removed, edited }) {
  for (const id of removed) { const song = songs.value.find(x => x.id === id); if (song) remove(song) }
  for (const e of edited) { const song = songs.value.find(x => x.id === e.id); if (song) Object.assign(song, { number: e.number, title: e.title, text: e.text }) }
  songs.value.push(...added.map(x => ({ id: x.id, type: 'song', number: x.number, title: x.title, text: x.text })))
}
