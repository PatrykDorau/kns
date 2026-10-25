// Listy i wyszukiwanie (materiały, pieśni, pieśni nabożeństwa).
import { computed } from 'vue'
import { label } from './live'
import { SONG_LIMIT, items, search, settings, songs } from './state'

/* ---------- listy ---------- */
export const plain = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')
export const songText = new WeakMap() // pieśń → tekst do wyszukiwania (liczony raz na zmianę)
export function searchable(song) {
  const key = song.number + '\n' + song.title + '\n' + song.text
  let cached = songText.get(song)
  if (!cached || cached.key !== key) songText.set(song, cached = { key, title: plain(song.title), text: plain(song.text) })
  return cached
}

export const visibleItems = computed(() => {
  const q = plain(search.materials.trim())
  return items.value.filter(it => !it.hidden && !it.lib && (!q || plain(label(it)).includes(q))) // tylko Biblioteka Rzutnika
})
export const byTitle = (a, b) => a.title.localeCompare(b.title, 'pl')
export const byNumber = (a, b) => (a.number ? +a.number || 1e9 : 1e9) - (b.number ? +b.number || 1e9 : 1e9)
export const sortSongs = list => [...list].sort(settings.songSort === 'title' ? byTitle : (a, b) => byNumber(a, b) || byTitle(a, b))
export const sortedSongs = computed(() => sortSongs(songs.value))
// list: posortowana lista do przeszukania (domyślnie cała baza; okno bazy pieśni podaje swoją wersję roboczą).
export function matchSongs(query, list = sortedSongs.value) {
  const q = plain(query.trim())
  if (!q) return list
  // Trafienia w numerze i tytule idą przed trafieniami w samym tekście.
  const first = [], rest = []
  for (const s of list) {
    const c = searchable(s)
    if (s.number === q || c.title.includes(q)) first.push(s)
    else if (c.text.includes(q)) rest.push(s)
  }
  return [...first, ...rest]
}
export const matchingSongs = computed(() => matchSongs(search.songs))
export const findSongs = (query, limit = 8) => (query.trim() ? matchSongs(query).slice(0, limit) : [])
// Podpowiedzi przy dodawaniu pieśni do nabożeństwa.
export const serviceResults = computed(() => (search.service.trim() ? matchSongs(search.service).slice(0, 8) : []))
export const serviceList = computed(() => settings.service
  .map(e => ({ key: e.key, song: songs.value.find(s => s.id === e.songId) }))
  .filter(e => e.song))
export const songMatches = computed(() => matchingSongs.value.length)
export const visibleSongs = computed(() => matchingSongs.value.slice(0, SONG_LIMIT))
